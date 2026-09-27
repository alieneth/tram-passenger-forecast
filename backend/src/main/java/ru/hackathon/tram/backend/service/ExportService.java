package ru.hackathon.tram.backend.service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import ru.hackathon.tram.backend.exception.ApiException;
import ru.hackathon.tram.backend.exception.ErrorCode;
import ru.hackathon.tram.backend.generated.model.Horizon;

/**
 * CSV-выгрузки прогноза. xlsx не реализован: у сгенерированного exportForecast возвращаемый тип —
 * String (общий для трёх content-type в контракте), в него бинарный xlsx корректно не положить — не
 * подменяю честный файл битым, возвращаем 501 для этого формата (см. ApiController).
 */
@Service
public class ExportService {

  private final NamedParameterJdbcTemplate jdbcTemplate;
  private final ForecastService forecastService;

  public ExportService(NamedParameterJdbcTemplate jdbcTemplate, ForecastService forecastService) {
    this.jdbcTemplate = jdbcTemplate;
    this.forecastService = forecastService;
  }

  /** route;date;hour;prediction — тот же формат, что и сабмит, но с любым горизонтом/фильтром. */
  public String exportCsv(
      LocalDate dateFrom, LocalDate dateTo, List<Integer> routes, Horizon horizon) {
    int versionId = forecastService.loadActiveModel().id();
    return buildCsv(versionId, dateFrom, dateTo, routes, horizon);
  }

  /** Ровно route;date;hour;prediction, только horizon=day — формат test_submission.csv. */
  public String exportSubmission(LocalDate dateFrom, LocalDate dateTo, List<Integer> routes) {
    int versionId = forecastService.loadActiveModel().id();
    return buildCsv(versionId, dateFrom, dateTo, routes, Horizon.DAY);
  }

  private String buildCsv(
      int versionId, LocalDate dateFrom, LocalDate dateTo, List<Integer> routes, Horizon horizon) {
    MapSqlParameterSource params =
        new MapSqlParameterSource()
            .addValue("versionId", versionId)
            .addValue("horizon", horizon.getValue())
            .addValue("dateFrom", dateFrom)
            .addValue("dateTo", dateTo);
    StringBuilder sql =
        new StringBuilder(
            "SELECT route, date, hour, prediction FROM forecast "
                + "WHERE model_version_id = :versionId AND horizon = :horizon "
                + "AND date BETWEEN :dateFrom AND :dateTo ");
    if (routes != null && !routes.isEmpty()) {
      params.addValue("routes", routes);
      sql.append("AND route IN (:routes) ");
    }
    sql.append("ORDER BY route, date, hour");

    List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql.toString(), params);
    if (rows.isEmpty()) {
      throw new ApiException(ErrorCode.FORECAST_NOT_FOUND, "Нет прогноза за указанный период");
    }

    StringBuilder csv = new StringBuilder("route;date;hour;prediction\n");
    for (Map<String, Object> row : rows) {
      Object hour = row.get("hour");
      csv.append(row.get("route"))
          .append(';')
          .append(row.get("date"))
          .append(';')
          .append(hour == null ? "" : hour)
          .append(';')
          .append(row.get("prediction"))
          .append('\n');
    }
    return csv.toString();
  }
}
