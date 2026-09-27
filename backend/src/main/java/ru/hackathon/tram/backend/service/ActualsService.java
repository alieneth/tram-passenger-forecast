package ru.hackathon.tram.backend.service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import ru.hackathon.tram.backend.exception.ApiException;
import ru.hackathon.tram.backend.exception.ErrorCode;
import ru.hackathon.tram.backend.generated.model.ActualItem;
import ru.hackathon.tram.backend.generated.model.ActualsResponse;

@Service
public class ActualsService {

  private static final int MAX_RANGE_DAYS = 92;

  private final NamedParameterJdbcTemplate jdbcTemplate;

  public ActualsService(NamedParameterJdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public ActualsResponse getActuals(
      LocalDate dateFrom, LocalDate dateTo, List<Integer> routes, String granularity) {
    String gran = granularity == null ? "hour" : granularity;
    validate(dateFrom, dateTo, gran);

    MapSqlParameterSource params =
        new MapSqlParameterSource().addValue("dateFrom", dateFrom).addValue("dateTo", dateTo);
    String routeFilter = "";
    if (routes != null && !routes.isEmpty()) {
      params.addValue("routes", routes);
      routeFilter = "AND route IN (:routes) ";
    }

    List<ActualItem> items =
        "day".equals(gran) ? queryByDay(params, routeFilter) : queryByHour(params, routeFilter);

    if (items.isEmpty()) {
      throw new ApiException(ErrorCode.ACTUALS_NOT_FOUND, "Нет фактических данных за период");
    }
    return new ActualsResponse(ActualsResponse.GranularityEnum.fromValue(gran), items);
  }

  private void validate(LocalDate dateFrom, LocalDate dateTo, String granularity) {
    if (dateTo.isBefore(dateFrom)) {
      throw new ApiException(ErrorCode.VALIDATION_ERROR, "date_to раньше date_from");
    }
    if (ChronoUnit.DAYS.between(dateFrom, dateTo) > MAX_RANGE_DAYS) {
      throw new ApiException(ErrorCode.VALIDATION_ERROR, "Период не может быть больше 92 дней");
    }
    if (!"hour".equals(granularity) && !"day".equals(granularity)) {
      throw new ApiException(ErrorCode.VALIDATION_ERROR, "granularity: допустимо hour или day");
    }
  }

  private List<ActualItem> queryByHour(MapSqlParameterSource params, String routeFilter) {
    String sql =
        "SELECT route, date, hour, boardings, trams_on_line FROM boardings_hourly "
            + "WHERE date BETWEEN :dateFrom AND :dateTo "
            + routeFilter
            + "ORDER BY route, date, hour";
    return jdbcTemplate.query(
        sql,
        params,
        (rs, rowNum) -> {
          ActualItem item =
              new ActualItem(
                      rs.getInt("route"),
                      rs.getObject("date", LocalDate.class),
                      rs.getInt("boardings"))
                  .hour(rs.getInt("hour"));
          int tramsOnLine = rs.getInt("trams_on_line");
          if (!rs.wasNull()) {
            item.tramsOnLine(tramsOnLine);
          }
          return item;
        });
  }

  private List<ActualItem> queryByDay(MapSqlParameterSource params, String routeFilter) {
    String sql =
        "SELECT route, date, SUM(boardings) AS boardings FROM boardings_hourly "
            + "WHERE date BETWEEN :dateFrom AND :dateTo "
            + routeFilter
            + "GROUP BY route, date ORDER BY route, date";
    return jdbcTemplate.query(
        sql,
        params,
        (rs, rowNum) ->
            new ActualItem(
                rs.getInt("route"), rs.getObject("date", LocalDate.class), rs.getInt("boardings")));
  }
}
