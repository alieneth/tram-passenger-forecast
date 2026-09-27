package ru.hackathon.tram.backend.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import ru.hackathon.tram.backend.exception.ApiException;
import ru.hackathon.tram.backend.exception.ErrorCode;
import ru.hackathon.tram.backend.generated.model.ForecastItem;
import ru.hackathon.tram.backend.generated.model.ForecastResponse;
import ru.hackathon.tram.backend.generated.model.Horizon;

@Service
public class ForecastService {

  private static final int MAX_RANGE_DAYS = 62;
  private static final ZoneOffset MOSCOW_OFFSET = ZoneOffset.ofHours(3);

  private final NamedParameterJdbcTemplate jdbcTemplate;
  private final int passengersPerTramNorm;

  public ForecastService(
      NamedParameterJdbcTemplate jdbcTemplate,
      @Value("${app.passengers-per-tram-norm}") int passengersPerTramNorm) {
    this.jdbcTemplate = jdbcTemplate;
    this.passengersPerTramNorm = passengersPerTramNorm;
  }

  public ForecastResponse getForecast(
      LocalDate dateFrom,
      LocalDate dateToOrNull,
      List<Integer> routes,
      Horizon horizon,
      Integer hourFrom,
      Integer hourTo) {
    LocalDate dateTo = dateToOrNull == null ? dateFrom : dateToOrNull;
    if (dateTo.isBefore(dateFrom)) {
      throw new ApiException(ErrorCode.VALIDATION_ERROR, "date_to раньше date_from");
    }
    if (ChronoUnit.DAYS.between(dateFrom, dateTo) > MAX_RANGE_DAYS) {
      throw new ApiException(ErrorCode.VALIDATION_ERROR, "Период не может быть больше 62 дней");
    }

    ActiveModel active = loadActiveModel();
    List<ForecastItem> items =
        queryItems(active.id(), dateFrom, dateTo, routes, horizon, hourFrom, hourTo);
    if (items.isEmpty()) {
      throw new ApiException(ErrorCode.FORECAST_NOT_FOUND, "Нет прогноза за указанный период");
    }
    return new ForecastResponse(active.versionName(), horizon, items, active.generatedAt());
  }

  private List<ForecastItem> queryItems(
      int versionId,
      LocalDate dateFrom,
      LocalDate dateTo,
      List<Integer> routes,
      Horizon horizon,
      Integer hourFrom,
      Integer hourTo) {
    MapSqlParameterSource params =
        new MapSqlParameterSource()
            .addValue("versionId", versionId)
            .addValue("horizon", horizon.getValue())
            .addValue("dateFrom", dateFrom)
            .addValue("dateTo", dateTo);
    StringBuilder sql =
        new StringBuilder(
            "SELECT route, date, hour, prediction, lower, upper, trams_on_line, is_analog "
                + "FROM forecast WHERE model_version_id = :versionId AND horizon = :horizon "
                + "AND date BETWEEN :dateFrom AND :dateTo ");
    if (routes != null && !routes.isEmpty()) {
      params.addValue("routes", routes);
      sql.append("AND route IN (:routes) ");
    }
    if (Horizon.DAY.equals(horizon)) {
      params.addValue("hourFrom", hourFrom == null ? 0 : hourFrom);
      params.addValue("hourTo", hourTo == null ? 23 : hourTo);
      sql.append("AND hour BETWEEN :hourFrom AND :hourTo ");
    }
    sql.append("ORDER BY route, date, hour");

    return jdbcTemplate.query(
        sql.toString(),
        params,
        (rs, rowNum) -> {
          int prediction = rs.getInt("prediction");
          ForecastItem item =
              new ForecastItem(
                  rs.getInt("route"),
                  rs.getObject("date", LocalDate.class),
                  prediction,
                  rs.getInt("lower"),
                  rs.getInt("upper"),
                  rs.getBoolean("is_analog"));
          int hour = rs.getInt("hour");
          if (!rs.wasNull()) {
            item.hour(hour);
          }
          int tramsOnLineRaw = rs.getInt("trams_on_line");
          // Реальных данных о числе трамваев на линии сейчас нет (прогноз Ярослава их не считает) —
          // оцениваем по норме пассажиров на трамвай, а не оставляем поле пустым.
          int tramsOnLine =
              rs.wasNull() ? Math.ceilDiv(prediction, passengersPerTramNorm) : tramsOnLineRaw;
          item.tramsOnLine(tramsOnLine);
          if (tramsOnLine > 0) {
            item.passengersPerTram(
                BigDecimal.valueOf(prediction)
                    .divide(BigDecimal.valueOf(tramsOnLine), 1, RoundingMode.HALF_UP));
          }
          return item;
        });
  }

  ActiveModel loadActiveModel() {
    try {
      Map<String, Object> row =
          jdbcTemplate.queryForMap(
              "SELECT version_name, MAX(f.created_at) AS generated_at "
                  + "FROM model_version mv LEFT JOIN forecast f ON f.model_version_id = mv.model_version_id "
                  + "WHERE mv.is_active = true GROUP BY mv.model_version_id, version_name",
              Map.of());
      Integer versionId =
          jdbcTemplate.queryForObject(
              "SELECT model_version_id FROM model_version WHERE is_active = true",
              Map.of(),
              Integer.class);
      java.sql.Timestamp generatedAt = (java.sql.Timestamp) row.get("generated_at");
      OffsetDateTime generatedAtOffset =
          generatedAt == null ? null : generatedAt.toLocalDateTime().atOffset(MOSCOW_OFFSET);
      return new ActiveModel(versionId, (String) row.get("version_name"), generatedAtOffset);
    } catch (EmptyResultDataAccessException e) {
      throw new ApiException(
          ErrorCode.FORECAST_NOT_READY, "Прогноз ещё не рассчитан. Повторите позже");
    }
  }

  record ActiveModel(int id, String versionName, OffsetDateTime generatedAt) {}
}
