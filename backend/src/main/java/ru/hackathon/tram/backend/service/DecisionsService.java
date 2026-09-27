package ru.hackathon.tram.backend.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import ru.hackathon.tram.backend.exception.ApiException;
import ru.hackathon.tram.backend.exception.ErrorCode;
import ru.hackathon.tram.backend.generated.model.Decision;
import ru.hackathon.tram.backend.generated.model.DecisionList;
import ru.hackathon.tram.backend.generated.model.DecisionStatusCode;
import ru.hackathon.tram.backend.generated.model.DecisionStatusResult;
import ru.hackathon.tram.backend.generated.model.DecisionStatusUpdate;

/**
 * CRUD над уже созданными решениями (CLAUDE.md раздел 6.6, В2). Сама генерация решений (сравнение
 * прогноза с нормой и поиск донора того же депо) — отдельная, более крупная бизнес- логика поверх
 * реального прогноза, которого пока нет в БД; здесь её нет, таблица decision пока пустая и
 * заполняется только через явные вставки/будущий генератор.
 */
@Service
public class DecisionsService {

  private static final ZoneOffset MOSCOW_OFFSET = ZoneOffset.ofHours(3);
  private static final Set<String> ACCEPTED_FROM = Set.of("awaiting", "updated");
  private static final Set<String> EXECUTED_FROM = Set.of("accepted");

  private final NamedParameterJdbcTemplate jdbcTemplate;

  public DecisionsService(NamedParameterJdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public DecisionList getDecisions(
      List<DecisionStatusCode> statuses, LocalDate date, Integer route) {
    expireOverdue();

    MapSqlParameterSource params = new MapSqlParameterSource();
    StringBuilder where = new StringBuilder(" WHERE 1=1 ");
    if (statuses != null && !statuses.isEmpty()) {
      params.addValue("statuses", statuses.stream().map(DecisionStatusCode::getValue).toList());
      where.append(" AND ds.status_code IN (:statuses) ");
    }
    if (date != null) {
      params.addValue("date", date);
      where.append(" AND d.date = :date ");
    }
    if (route != null) {
      params.addValue("route", route);
      where.append(" AND d.route = :route ");
    }

    String sql =
        "SELECT d.decision_id, d.parent_decision_id, d.decision_type, d.route, d.donor_route, d.date, "
            + "d.hour_from, d.hour_to, d.trams_delta, d.norm, d.load_before, d.load_after, "
            + "d.donor_load_before, d.donor_load_after, d.same_depot, d.deadline_at, "
            + "ds.status_code, ds.status_name, d.created_at "
            + "FROM decision d JOIN decision_status ds ON ds.status_id = d.status_id"
            + where
            + " ORDER BY d.deadline_at, d.decision_id";

    List<Decision> items =
        jdbcTemplate.query(
            sql,
            params,
            (rs, rowNum) -> {
              BigDecimal loadBefore = rs.getBigDecimal("load_before");
              int norm = rs.getInt("norm");
              int excessPct =
                  loadBefore
                      .divide(BigDecimal.valueOf(norm), 4, RoundingMode.HALF_UP)
                      .subtract(BigDecimal.ONE)
                      .multiply(BigDecimal.valueOf(100))
                      .setScale(0, RoundingMode.HALF_UP)
                      .intValue();
              Decision decision =
                  new Decision(
                      rs.getInt("decision_id"),
                      Decision.DecisionTypeEnum.fromValue(rs.getString("decision_type")),
                      rs.getInt("route"),
                      rs.getObject("date", LocalDate.class),
                      rs.getInt("hour_from"),
                      rs.getInt("hour_to"),
                      rs.getInt("trams_delta"),
                      norm,
                      loadBefore,
                      rs.getBigDecimal("load_after"),
                      excessPct,
                      rs.getBoolean("same_depot"),
                      toOffset(rs.getTimestamp("deadline_at")),
                      DecisionStatusCode.fromValue(rs.getString("status_code")),
                      rs.getString("status_name"),
                      toOffset(rs.getTimestamp("created_at")));
              int parentId = rs.getInt("parent_decision_id");
              if (!rs.wasNull()) {
                decision.parentDecisionId(parentId);
              }
              int donorRoute = rs.getInt("donor_route");
              if (!rs.wasNull()) {
                decision.donorRoute(donorRoute);
              }
              BigDecimal donorLoadBefore = rs.getBigDecimal("donor_load_before");
              if (donorLoadBefore != null) {
                decision.donorLoadBefore(donorLoadBefore);
              }
              BigDecimal donorLoadAfter = rs.getBigDecimal("donor_load_after");
              if (donorLoadAfter != null) {
                decision.donorLoadAfter(donorLoadAfter);
              }
              return decision;
            });

    return new DecisionList(items, items.size());
  }

  public DecisionStatusResult updateStatus(
      int decisionId, DecisionStatusUpdate update, String changedBy) {
    expireOverdue();

    Map<String, Object> row;
    try {
      row =
          jdbcTemplate.queryForMap(
              "SELECT d.decision_id, ds.status_code FROM decision d "
                  + "JOIN decision_status ds ON ds.status_id = d.status_id WHERE d.decision_id = :id",
              new MapSqlParameterSource("id", decisionId));
    } catch (EmptyResultDataAccessException e) {
      throw new ApiException(ErrorCode.DECISION_NOT_FOUND, "Решение " + decisionId + " не найдено");
    }

    String currentStatus = (String) row.get("status_code");
    String newStatus = update.getStatusCode().getValue();
    validateTransition(currentStatus, newStatus);

    if (("rejected".equals(newStatus) || "not_executed".equals(newStatus))
        && (update.getReason() == null || update.getReason().isBlank())) {
      throw new ApiException(ErrorCode.VALIDATION_ERROR, "reason обязателен для " + newStatus);
    }

    jdbcTemplate.update(
        "UPDATE decision SET status_id = (SELECT status_id FROM decision_status WHERE status_code = :status) "
            + "WHERE decision_id = :id",
        new MapSqlParameterSource().addValue("status", newStatus).addValue("id", decisionId));
    logChange(decisionId, newStatus, changedBy, update.getReason());

    if ("accepted".equals(newStatus)) {
      closeSiblingAlternatives(decisionId, changedBy);
    }

    return new DecisionStatusResult(
            decisionId,
            update.getStatusCode() == null ? null : DecisionStatusCode.fromValue(newStatus),
            statusName(newStatus),
            java.time.OffsetDateTime.now(MOSCOW_OFFSET),
            changedBy)
        .reason(update.getReason());
  }

  private void validateTransition(String from, String to) {
    boolean valid =
        (ACCEPTED_FROM.contains(from) && Set.of("accepted", "rejected").contains(to))
            || (EXECUTED_FROM.contains(from) && Set.of("executed", "not_executed").contains(to));
    if (!valid) {
      throw new ApiException(
          ErrorCode.INVALID_STATUS_TRANSITION,
          "Нельзя перевести решение из статуса " + from + " в " + to);
    }
  }

  /** Основное решение принято — альтернативные варианты (тот же parent_decision_id) закрываются. */
  private void closeSiblingAlternatives(int decisionId, String changedBy) {
    List<Integer> siblings =
        jdbcTemplate.query(
            "SELECT decision_id FROM decision "
                + "WHERE parent_decision_id = (SELECT COALESCE(parent_decision_id, decision_id) FROM decision WHERE decision_id = :id) "
                + "AND decision_id <> :id",
            new MapSqlParameterSource("id", decisionId),
            (rs, rowNum) -> rs.getInt("decision_id"));
    for (int siblingId : siblings) {
      jdbcTemplate.update(
          "UPDATE decision SET status_id = (SELECT status_id FROM decision_status WHERE status_code = 'closed') "
              + "WHERE decision_id = :id",
          new MapSqlParameterSource("id", siblingId));
      logChange(siblingId, "closed", changedBy, "Принят другой вариант решения");
    }
  }

  private void expireOverdue() {
    List<Integer> expired =
        jdbcTemplate.query(
            "SELECT d.decision_id FROM decision d JOIN decision_status ds ON ds.status_id = d.status_id "
                + "WHERE ds.status_code IN ('awaiting', 'updated') AND d.deadline_at < now()",
            Map.of(),
            (rs, rowNum) -> rs.getInt("decision_id"));
    for (int id : expired) {
      jdbcTemplate.update(
          "UPDATE decision SET status_id = (SELECT status_id FROM decision_status WHERE status_code = 'expired') "
              + "WHERE decision_id = :id",
          new MapSqlParameterSource("id", id));
      logChange(id, "expired", "system", null);
    }
  }

  private void logChange(int decisionId, String statusCode, String changedBy, String reason) {
    jdbcTemplate.update(
        "INSERT INTO decision_log (decision_id, status_id, changed_by, reason) "
            + "VALUES (:id, (SELECT status_id FROM decision_status WHERE status_code = :status), :changedBy, :reason)",
        new MapSqlParameterSource()
            .addValue("id", decisionId)
            .addValue("status", statusCode)
            .addValue("changedBy", changedBy)
            .addValue("reason", reason));
  }

  private String statusName(String statusCode) {
    return jdbcTemplate.queryForObject(
        "SELECT status_name FROM decision_status WHERE status_code = :status",
        new MapSqlParameterSource("status", statusCode),
        String.class);
  }

  private java.time.OffsetDateTime toOffset(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toLocalDateTime().atOffset(MOSCOW_OFFSET);
  }
}
