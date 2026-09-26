package ru.hackathon.tram.backend.service;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import ru.hackathon.tram.backend.entity.Depot;
import ru.hackathon.tram.backend.entity.RouteStop;
import ru.hackathon.tram.backend.exception.ApiException;
import ru.hackathon.tram.backend.exception.ErrorCode;
import ru.hackathon.tram.backend.generated.model.RouteGeometry;
import ru.hackathon.tram.backend.generated.model.RouteGeometryDirectionsInner;
import ru.hackathon.tram.backend.generated.model.RouteGeometryDirectionsInner.DirectionIdEnum;
import ru.hackathon.tram.backend.generated.model.RouteList;
import ru.hackathon.tram.backend.generated.model.Stop;
import ru.hackathon.tram.backend.repository.RouteRepository;
import ru.hackathon.tram.backend.repository.RouteStopRepository;

@Service
public class RouteService {

  private final RouteRepository routeRepository;
  private final RouteStopRepository routeStopRepository;

  public RouteService(RouteRepository routeRepository, RouteStopRepository routeStopRepository) {
    this.routeRepository = routeRepository;
    this.routeStopRepository = routeStopRepository;
  }

  public RouteList getRoutes(Boolean isNew) {
    List<ru.hackathon.tram.backend.entity.Route> routes =
        isNew == null
            ? routeRepository.findAllWithDepot()
            : routeRepository.findByIsNewWithDepot(isNew);
    List<ru.hackathon.tram.backend.generated.model.Route> items =
        routes.stream().map(this::toApiRoute).toList();
    return new RouteList(items, items.size());
  }

  public RouteGeometry getRouteGeometry(int route, Integer directionId) {
    ru.hackathon.tram.backend.entity.Route routeEntity =
        routeRepository
            .findById(route)
            .orElseThrow(
                () ->
                    new ApiException(ErrorCode.ROUTE_NOT_FOUND, "Маршрут " + route + " не найден"));

    List<RouteStop> routeStops = routeStopRepository.findByRoute(route);
    if (directionId != null) {
      routeStops =
          routeStops.stream().filter(rs -> directionId.equals((int) rs.getDirectionId())).toList();
    }
    if (routeStops.isEmpty()) {
      throw new ApiException(
          ErrorCode.GEOMETRY_NOT_FOUND, "Координаты маршрута " + route + " не найдены");
    }

    List<RouteGeometryDirectionsInner> directions =
        routeStops.stream()
            .collect(
                Collectors.groupingBy(
                    RouteStop::getDirectionId, LinkedHashMap::new, Collectors.toList()))
            .entrySet()
            .stream()
            .map(
                entry ->
                    new RouteGeometryDirectionsInner(
                        DirectionIdEnum.fromValue((int) entry.getKey()),
                        mainTripStops(entry.getValue())))
            .toList();

    return new RouteGeometry(routeEntity.getRoute(), directions)
        .routeLongName(routeEntity.getRouteLongName());
  }

  /**
   * У одного направления может быть несколько вариантов рейсов (trip_id) с разным набором
   * остановок. Берём вариант с наибольшим числом остановок как основную трассу — другого критерия в
   * справочнике нет.
   */
  private List<Stop> mainTripStops(List<RouteStop> directionStops) {
    Map<Integer, List<RouteStop>> byTrip =
        directionStops.stream().collect(Collectors.groupingBy(RouteStop::getTripId));
    return byTrip.values().stream().max(Comparator.comparingInt(List::size)).orElseThrow().stream()
        .sorted(Comparator.comparing(RouteStop::getStopSequence))
        .map(this::toApiStop)
        .toList();
  }

  private ru.hackathon.tram.backend.generated.model.Route toApiRoute(
      ru.hackathon.tram.backend.entity.Route route) {
    Depot depot = route.getDepot();
    return new ru.hackathon.tram.backend.generated.model.Route(
            route.getRoute(), route.isNew(), route.isHasGeometry())
        .routeLongName(route.getRouteLongName())
        .depotId(depot == null ? null : depot.getDepotId())
        .depotName(depot == null ? null : depot.getDepotName())
        .dateStart(route.getDateStart());
  }

  private Stop toApiStop(RouteStop routeStop) {
    ru.hackathon.tram.backend.entity.Stop stop = routeStop.getStop();
    return new Stop(
        routeStop.getStopSequence().intValue(),
        stop.getStopId(),
        stop.getStopName(),
        stop.getStopLat(),
        stop.getStopLon());
  }
}
