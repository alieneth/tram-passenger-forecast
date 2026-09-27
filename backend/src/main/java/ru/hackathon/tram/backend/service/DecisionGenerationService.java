package ru.hackathon.tram.backend.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Генерация решений (CLAUDE.md раздел 6.6): маршрут превышает норму пассажиров на трамвай —
 * предложить переброску трамваев с маршрута-донора того же депо, либо резерв, если донора нет.
 *
 * <p>Работает только там, где известно РЕАЛЬНОЕ {@code forecast.trams_on_line} — это не то же
 * самое, что оценка "prediction / норма", которую {@link ForecastService} показывает в API, когда
 * реальных данных нет (та оценка по построению никогда не превышает норму, сравнивать с ней
 * нечего). Пока трамваи на линии не даёт ни один источник (нет прогноза от Ярослава с этим полем,
 * не загружены сырые валидации с bus_exit_no) — генератор корректно не создаёт ни одного решения.
 * Это не баг, а честное отражение того, что входных данных для этой конкретной фичи ещё нет.
 */
@Service
public class DecisionGenerationService {

  // Донора не трогаем "под ноль" — оставляем не менее одного трамвая на маршруте.
  private static final int MIN_TRAMS_LEFT_ON_DONOR = 1;
  // Донор должен иметь запас ниже нормы, а не быть впритык — иначе просто переносим проблему.
  private static final BigDecimal DONOR_SAFETY_MARGIN = BigDecimal.valueOf(0.9);

  private final NamedParameterJdbcTemplate jdbcTemplate;
  private final int norm;
  private final int tramPrepMinutes;

  public DecisionGenerationService(
      NamedParameterJdbcTemplate jdbcTemplate,
      @Value("${app.passengers-per-tram-norm}") int norm,
      @Value("${app.tram-prep-minutes}") int tramPrepMinutes) {
    this.jdbcTemplate = jdbcTemplate;
    this.norm = norm;
    this.tramPrepMinutes = tramPrepMinutes;
  }

  private record RouteLoad(int route, LocalDate date, int hour, int prediction, int tramsOnLine) {
    BigDecimal loadPerTram() {
      return tramsOnLine <= 0
          ? BigDecimal.ZERO
          : BigDecimal.valueOf(prediction)
              .divide(BigDecimal.valueOf(tramsOnLine), 2, RoundingMode.HALF_UP);
    }
  }

  /**
   * Возвращает число созданных решений. Идемпотентно не гарантирует — рассчитан на разовый прогон.
   */
  public int generate() {
    Map<Integer, List<RouteLoad>> byDepotAndSlot = loadCandidates();
    int created = 0;
    for (List<RouteLoad> slot : byDepotAndSlot.values()) {
      created += generateForSlot(slot);
    }
    return created;
  }

  /** route+depot+date+hour, где известны и депо, и реальное число трамваев на линии. */
  private Map<Integer, List<RouteLoad>> loadCandidates() {
    String sql =
        "SELECT f.route, r.depot_id, f.date, f.hour, f.prediction, f.trams_on_line "
            + "FROM forecast f "
            + "JOIN route r ON r.route = f.route "
            + "JOIN model_version mv ON mv.model_version_id = f.model_version_id "
            + "WHERE mv.is_active = true AND f.horizon = 'day' "
            + "AND f.trams_on_line IS NOT NULL AND r.depot_id IS NOT NULL "
            + "ORDER BY r.depot_id, f.date, f.hour, f.route";

    Map<Integer, List<RouteLoad>> slots = new LinkedHashMap<>();
    jdbcTemplate.query(
        sql,
        Map.of(),
        rs -> {
          int depotId = rs.getInt("depot_id");
          LocalDate date = rs.getObject("date", LocalDate.class);
          int hour = rs.getInt("hour");
          int slotKey = slotKey(depotId, date, hour);
          slots
              .computeIfAbsent(slotKey, k -> new ArrayList<>())
              .add(
                  new RouteLoad(
                      rs.getInt("route"),
                      date,
                      hour,
                      rs.getInt("prediction"),
                      rs.getInt("trams_on_line")));
        });
    return slots;
  }

  private int slotKey(int depotId, LocalDate date, int hour) {
    return java.util.Objects.hash(depotId, date, hour);
  }

  private int generateForSlot(List<RouteLoad> slot) {
    if (slot.size() < 2) {
      return 0; // перебрасывать не с кем — донор должен быть в том же депо
    }
    List<RouteLoad> overloaded =
        slot.stream()
            .filter(r -> r.loadPerTram().compareTo(BigDecimal.valueOf(norm)) > 0)
            .sorted(Comparator.comparing(RouteLoad::loadPerTram).reversed())
            .toList();
    if (overloaded.isEmpty()) {
      return 0;
    }

    // Мутируемый запас трамваев доноров в пределах слота — один донор может отдать несколько
    // трамваев разным перегруженным маршрутам, но не больше своего реального остатка.
    Map<Integer, Integer> donorTramsLeft = new LinkedHashMap<>();
    for (RouteLoad r : slot) {
      donorTramsLeft.put(r.route(), r.tramsOnLine());
    }

    int created = 0;
    for (RouteLoad route : overloaded) {
      int neededTrams = ceilDiv(route.prediction(), norm) - route.tramsOnLine();
      if (neededTrams <= 0) {
        continue;
      }
      RouteLoad donor = findDonor(slot, route.route(), donorTramsLeft);
      if (donor == null) {
        insertDecision(route, null, neededTrams, null, null);
      } else {
        int donorSlack = donorTramsLeft.get(donor.route()) - ceilDiv(donor.prediction(), norm);
        int maxWithoutStranding = donorTramsLeft.get(donor.route()) - MIN_TRAMS_LEFT_ON_DONOR;
        int delta = Math.min(neededTrams, Math.min(donorSlack, maxWithoutStranding));
        if (delta < 1) {
          insertDecision(route, null, neededTrams, null, null);
        } else {
          donorTramsLeft.put(donor.route(), donorTramsLeft.get(donor.route()) - delta);
          insertDecision(
              route, donor, delta, donor.tramsOnLine(), donorTramsLeft.get(donor.route()));
        }
      }
      created++;
    }
    return created;
  }

  private RouteLoad findDonor(
      List<RouteLoad> slot, int excludeRoute, Map<Integer, Integer> tramsLeft) {
    BigDecimal safeThreshold = BigDecimal.valueOf(norm).multiply(DONOR_SAFETY_MARGIN);
    return slot.stream()
        .filter(r -> r.route() != excludeRoute)
        .filter(r -> tramsLeft.get(r.route()) > MIN_TRAMS_LEFT_ON_DONOR)
        .filter(r -> r.loadPerTram().compareTo(safeThreshold) < 0)
        .min(Comparator.comparing(RouteLoad::loadPerTram))
        .orElse(null);
  }

  private void insertDecision(
      RouteLoad route,
      RouteLoad donorBefore,
      int delta,
      Integer donorTramsBefore,
      Integer donorTramsAfter) {
    BigDecimal loadBefore = route.loadPerTram();
    BigDecimal loadAfter =
        BigDecimal.valueOf(route.prediction())
            .divide(BigDecimal.valueOf(route.tramsOnLine() + delta), 1, RoundingMode.HALF_UP);
    LocalDateTime deadline =
        LocalDateTime.of(route.date(), java.time.LocalTime.of(route.hour(), 0))
            .minusMinutes(tramPrepMinutes);

    MapSqlParameterSource params =
        new MapSqlParameterSource()
            .addValue("route", route.route())
            .addValue("donorRoute", donorBefore == null ? null : donorBefore.route())
            .addValue("decisionType", donorBefore == null ? "reserve" : "transfer")
            .addValue("date", route.date())
            .addValue("hourFrom", route.hour())
            .addValue("hourTo", route.hour())
            .addValue("tramsDelta", delta)
            .addValue("norm", norm)
            .addValue("loadBefore", loadBefore)
            .addValue("loadAfter", loadAfter)
            .addValue("donorLoadBefore", donorBefore == null ? null : donorBefore.loadPerTram())
            .addValue(
                "donorLoadAfter",
                donorBefore == null || donorTramsAfter == null
                    ? null
                    : BigDecimal.valueOf(donorBefore.prediction())
                        .divide(BigDecimal.valueOf(donorTramsAfter), 1, RoundingMode.HALF_UP))
            .addValue("sameDepot", true)
            .addValue("deadline", deadline);

    jdbcTemplate.update(
        "INSERT INTO decision (route, donor_route, decision_type, date, hour_from, hour_to, "
            + "trams_delta, norm, load_before, load_after, donor_load_before, donor_load_after, "
            + "same_depot, deadline_at, status_id) "
            + "VALUES (:route, :donorRoute, :decisionType, :date, :hourFrom, :hourTo, :tramsDelta, :norm, "
            + ":loadBefore, :loadAfter, :donorLoadBefore, :donorLoadAfter, :sameDepot, :deadline, "
            + "(SELECT status_id FROM decision_status WHERE status_code = 'awaiting'))",
        params);
  }

  private int ceilDiv(int numerator, int divisor) {
    return Math.ceilDiv(numerator, divisor);
  }
}
