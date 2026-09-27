package ru.hackathon.tram.backend.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import ru.hackathon.tram.backend.exception.ApiException;
import ru.hackathon.tram.backend.exception.ErrorCode;
import ru.hackathon.tram.backend.generated.model.FactorsResponse;
import ru.hackathon.tram.backend.generated.model.FactorsResponseContributionsInner;
import ru.hackathon.tram.backend.generated.model.FactorsResponseWeather;

@Service
public class FactorsService {

  private final JdbcTemplate jdbcTemplate;

  public FactorsService(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public FactorsResponse getFactors(LocalDate date, Integer route) {
    Map<String, Object> calendarRow;
    try {
      calendarRow =
          jdbcTemplate.queryForMap(
              "SELECT day_of_week, day_type, holiday_name, is_school_holiday FROM calendar_day "
                  + "WHERE date = ?",
              date);
    } catch (EmptyResultDataAccessException e) {
      throw new ApiException(
          ErrorCode.DATE_NOT_IN_CALENDAR, "Дата " + date + " вне производственного календаря");
    }

    FactorsResponse response =
        new FactorsResponse(
            date,
            ((Number) calendarRow.get("day_of_week")).intValue(),
            FactorsResponse.DayTypeEnum.fromValue((String) calendarRow.get("day_type")),
            (Boolean) calendarRow.get("is_school_holiday"),
            List.of());
    String holidayName = (String) calendarRow.get("holiday_name");
    if (holidayName != null) {
      response.holidayName(holidayName);
    }

    FactorsResponseWeather weather = loadWeather(date);
    if (weather != null) {
      response.weather(weather);
    }

    if (route != null) {
      List<FactorsResponseContributionsInner> contributions = loadContributions(date, route);
      if (!contributions.isEmpty()) {
        response.contributions(contributions);
      }
    }

    return response;
  }

  /**
   * "forecast" — единственный вид погоды, который умеем показывать сейчас: реально записанные
   * (архивные) наблюдения Open-Meteo за весь 2025 год. Организаторы разрешили не следить за утечкой
   * из будущего для факторов (CLAUDE.md раздел 13.2), поэтому отдельного различения "прогноз/норма"
   * пока нет — climate_norm появится, когда будет отдельный источник нормы.
   */
  private FactorsResponseWeather loadWeather(LocalDate date) {
    Map<String, Object> row =
        jdbcTemplate.queryForMap(
            "SELECT MIN(temperature_c) AS tmin, MAX(temperature_c) AS tmax, "
                + "SUM(precipitation_mm) AS precip, SUM(snowfall_cm) AS snow "
                + "FROM weather WHERE date = ? AND data_kind = 'archive'",
            date);
    if (row.get("tmin") == null) {
      return null;
    }
    return new FactorsResponseWeather()
        .dataKind(FactorsResponseWeather.DataKindEnum.fromValue("forecast"))
        .temperatureMin(toBigDecimal(row.get("tmin")))
        .temperatureMax(toBigDecimal(row.get("tmax")))
        .precipitationMm(toBigDecimal(row.get("precip")))
        .snowfallCm(toBigDecimal(row.get("snow")));
  }

  private List<FactorsResponseContributionsInner> loadContributions(LocalDate date, int route) {
    return jdbcTemplate.query(
        "SELECT fc.factor_code, fc.factor_name, fc.effect_pct FROM factor_contribution fc "
            + "JOIN model_version mv ON mv.model_version_id = fc.model_version_id "
            + "WHERE mv.is_active = true AND fc.route = ? AND fc.date = ?",
        (rs, rowNum) ->
            new FactorsResponseContributionsInner(
                rs.getString("factor_code"),
                rs.getString("factor_name"),
                rs.getBigDecimal("effect_pct")),
        route,
        date);
  }

  private BigDecimal toBigDecimal(Object value) {
    return value == null ? null : BigDecimal.valueOf(((Number) value).doubleValue());
  }
}
