package ru.hackathon.tram.backend.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import ru.hackathon.tram.backend.exception.ApiException;
import ru.hackathon.tram.backend.exception.ErrorCode;
import ru.hackathon.tram.backend.generated.model.Horizon;
import ru.hackathon.tram.backend.generated.model.ModelQuality;
import ru.hackathon.tram.backend.generated.model.ModelQualityByRouteInner;
import ru.hackathon.tram.backend.generated.model.QualityValues;

@Service
public class ModelQualityService {

  private final NamedParameterJdbcTemplate jdbcTemplate;

  public ModelQualityService(NamedParameterJdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public ModelQuality getModelQuality(Horizon horizon, String modelVersionName) {
    Map<String, Object> version = loadVersion(modelVersionName);
    int versionId = (Integer) version.get("model_version_id");
    String versionName = (String) version.get("version_name");

    List<Map<String, Object>> rows =
        jdbcTemplate.queryForList(
            "SELECT route, model_mae, baseline_mae, method, eval_date_from, eval_date_to "
                + "FROM model_quality WHERE model_version_id = :id AND horizon = :horizon",
            new MapSqlParameterSource()
                .addValue("id", versionId)
                .addValue("horizon", horizon.getValue()));

    Map<String, Object> overallRow =
        rows.stream().filter(r -> r.get("route") == null).findFirst().orElse(null);
    if (overallRow == null) {
      throw new ApiException(
          ErrorCode.FORECAST_NOT_READY,
          "Качество модели для версии " + versionName + " ещё не посчитано");
    }

    QualityValues overall =
        new QualityValues(
            (BigDecimal) overallRow.get("model_mae"), (BigDecimal) overallRow.get("baseline_mae"));

    List<ModelQualityByRouteInner> byRoute =
        rows.stream()
            .filter(r -> r.get("route") != null)
            .map(
                r ->
                    new ModelQualityByRouteInner(
                        (BigDecimal) r.get("model_mae"),
                        (BigDecimal) r.get("baseline_mae"),
                        (Integer) r.get("route"),
                        ModelQualityByRouteInner.MethodEnum.fromValue((String) r.get("method"))))
            .toList();

    return new ModelQuality(
        versionName,
        horizon,
        toLocalDate(overallRow.get("eval_date_from")),
        toLocalDate(overallRow.get("eval_date_to")),
        overall,
        byRoute);
  }

  private LocalDate toLocalDate(Object value) {
    return value instanceof java.sql.Date sqlDate ? sqlDate.toLocalDate() : (LocalDate) value;
  }

  private Map<String, Object> loadVersion(String modelVersionName) {
    try {
      if (modelVersionName != null) {
        return jdbcTemplate.queryForMap(
            "SELECT model_version_id, version_name FROM model_version WHERE version_name = :name",
            new MapSqlParameterSource("name", modelVersionName));
      }
      return jdbcTemplate.queryForMap(
          "SELECT model_version_id, version_name FROM model_version WHERE is_active = true",
          Map.of());
    } catch (EmptyResultDataAccessException e) {
      if (modelVersionName != null) {
        throw new ApiException(
            ErrorCode.MODEL_VERSION_NOT_FOUND, "Версия модели " + modelVersionName + " не найдена");
      }
      throw new ApiException(
          ErrorCode.FORECAST_NOT_READY, "Прогноз ещё не рассчитан. Повторите позже");
    }
  }
}
