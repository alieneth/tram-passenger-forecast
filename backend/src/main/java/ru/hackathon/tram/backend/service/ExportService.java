package ru.hackathon.tram.backend.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import ru.hackathon.tram.backend.exception.ApiException;
import ru.hackathon.tram.backend.exception.ErrorCode;
import ru.hackathon.tram.backend.generated.model.Horizon;

/**
 * Выгрузки прогноза — csv, submission и xlsx. У сгенерированного exportForecast возвращаемый тип —
 * String (контракт схлопнул text/csv и xlsx в один тип ответа), поэтому xlsx-байты в ApiController
 * кладутся в ResponseEntity через unchecked-приведение: на рантайме Java дженерики стёрты, Spring
 * сериализует по фактическому объекту в теле, а не по объявленному типу метода.
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

  /** Тот же набор строк, что и exportCsv, но настоящий .xlsx (Apache POI), не текст. */
  public byte[] exportXlsx(
      LocalDate dateFrom, LocalDate dateTo, List<Integer> routes, Horizon horizon) {
    int versionId = forecastService.loadActiveModel().id();
    List<Map<String, Object>> rows = queryRows(versionId, dateFrom, dateTo, routes, horizon);

    try (XSSFWorkbook workbook = new XSSFWorkbook()) {
      XSSFSheet sheet = workbook.createSheet("forecast");
      String[] headers = {"route", "date", "hour", "prediction"};
      Row headerRow = sheet.createRow(0);
      for (int i = 0; i < headers.length; i++) {
        headerRow.createCell(i).setCellValue(headers[i]);
      }
      int rowNum = 1;
      for (Map<String, Object> data : rows) {
        Row row = sheet.createRow(rowNum++);
        setCell(row, 0, ((Number) data.get("route")).doubleValue());
        row.createCell(1).setCellValue(String.valueOf(data.get("date")));
        Object hour = data.get("hour");
        if (hour != null) {
          setCell(row, 2, ((Number) hour).doubleValue());
        }
        setCell(row, 3, ((Number) data.get("prediction")).doubleValue());
      }
      for (int i = 0; i < headers.length; i++) {
        sheet.autoSizeColumn(i);
      }
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      workbook.write(out);
      return out.toByteArray();
    } catch (IOException e) {
      throw new UncheckedIOException("Не удалось собрать xlsx", e);
    }
  }

  private void setCell(Row row, int index, double value) {
    Cell cell = row.createCell(index);
    cell.setCellValue(value);
  }

  private String buildCsv(
      int versionId, LocalDate dateFrom, LocalDate dateTo, List<Integer> routes, Horizon horizon) {
    List<Map<String, Object>> rows = queryRows(versionId, dateFrom, dateTo, routes, horizon);

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

  private List<Map<String, Object>> queryRows(
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
    return rows;
  }
}
