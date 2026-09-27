package ru.hackathon.tram.backend.controller;

import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.hackathon.tram.backend.exception.ApiException;
import ru.hackathon.tram.backend.exception.ErrorCode;
import ru.hackathon.tram.backend.generated.api.DefaultApi;
import ru.hackathon.tram.backend.generated.model.ActualsResponse;
import ru.hackathon.tram.backend.generated.model.DecisionList;
import ru.hackathon.tram.backend.generated.model.DecisionStatusCode;
import ru.hackathon.tram.backend.generated.model.DecisionStatusResult;
import ru.hackathon.tram.backend.generated.model.DecisionStatusUpdate;
import ru.hackathon.tram.backend.generated.model.ErrorDetailsInner;
import ru.hackathon.tram.backend.generated.model.FactorsResponse;
import ru.hackathon.tram.backend.generated.model.ForecastResponse;
import ru.hackathon.tram.backend.generated.model.Health;
import ru.hackathon.tram.backend.generated.model.Horizon;
import ru.hackathon.tram.backend.generated.model.IngestResult;
import ru.hackathon.tram.backend.generated.model.ModelQuality;
import ru.hackathon.tram.backend.generated.model.RouteGeometry;
import ru.hackathon.tram.backend.generated.model.RouteList;
import ru.hackathon.tram.backend.generated.model.ValidationBatch;
import ru.hackathon.tram.backend.service.ActualsService;
import ru.hackathon.tram.backend.service.FactorsService;
import ru.hackathon.tram.backend.service.HealthService;
import ru.hackathon.tram.backend.service.RouteService;

/**
 * Один контроллер на весь контракт: у тегов в docs/openapi.yaml кириллические названия, из-за этого
 * openapi-generator не смог разбить операции по отдельным *Api-интерфейсам (Cyrillic → санитайзер
 * имени класса даёт пустую строку → всё падает в DefaultApi). Разбивка по смыслу — на уровне
 * сервисов.
 */
@RestController
@RequestMapping("/api/v1")
public class ApiController implements DefaultApi {

  private final RouteService routeService;
  private final HealthService healthService;
  private final ActualsService actualsService;
  private final FactorsService factorsService;

  public ApiController(
      RouteService routeService,
      HealthService healthService,
      ActualsService actualsService,
      FactorsService factorsService) {
    this.routeService = routeService;
    this.healthService = healthService;
    this.actualsService = actualsService;
    this.factorsService = factorsService;
  }

  @Override
  public ResponseEntity<RouteList> getRoutes(Boolean isNew) {
    return ResponseEntity.ok(routeService.getRoutes(isNew));
  }

  @Override
  public ResponseEntity<RouteGeometry> getRouteGeometry(Integer route, Integer directionId) {
    if (directionId != null && directionId != 0 && directionId != 1) {
      throw new ApiException(
          ErrorCode.VALIDATION_ERROR,
          "Некорректные параметры запроса",
          List.of(new ErrorDetailsInner("direction_id", "Допустимые значения: 0, 1")));
    }
    return ResponseEntity.ok(routeService.getRouteGeometry(route, directionId));
  }

  @Override
  public ResponseEntity<Health> getHealth() {
    Health health = healthService.check();
    HttpStatus status =
        health.getStatus() == Health.StatusEnum.DOWN
            ? HttpStatus.SERVICE_UNAVAILABLE
            : HttpStatus.OK;
    return ResponseEntity.status(status).body(health);
  }

  // Ниже — методы контракта, ещё не реализованные (отдельные задачи бэклога API-3..API-6).
  // Возвращаем 501, а не заглушку с придуманными данными — так честнее для фронтенда на этапе
  // интеграции.

  @Override
  public ResponseEntity<ForecastResponse> getForecast(
      LocalDate dateFrom,
      List<Integer> route,
      LocalDate dateTo,
      Horizon horizon,
      Integer hourFrom,
      Integer hourTo) {
    return notImplemented();
  }

  @Override
  public ResponseEntity<ActualsResponse> getActuals(
      LocalDate dateFrom, LocalDate dateTo, List<Integer> route, String granularity) {
    return ResponseEntity.ok(actualsService.getActuals(dateFrom, dateTo, route, granularity));
  }

  @Override
  public ResponseEntity<FactorsResponse> getFactors(LocalDate date, Integer route) {
    return ResponseEntity.ok(factorsService.getFactors(date, route));
  }

  @Override
  public ResponseEntity<String> exportForecast(
      String format, LocalDate dateFrom, LocalDate dateTo, List<Integer> route, Horizon horizon) {
    return notImplemented();
  }

  @Override
  public ResponseEntity<IngestResult> ingestValidations(ValidationBatch validationBatch) {
    return notImplemented();
  }

  @Override
  public ResponseEntity<ModelQuality> getModelQuality(Horizon horizon, String modelVersion) {
    return notImplemented();
  }

  @Override
  public ResponseEntity<DecisionList> getDecisions(
      List<DecisionStatusCode> status, LocalDate date, Integer route) {
    return notImplemented();
  }

  @Override
  public ResponseEntity<DecisionStatusResult> updateDecisionStatus(
      Integer decisionId, DecisionStatusUpdate decisionStatusUpdate) {
    return notImplemented();
  }

  private <T> ResponseEntity<T> notImplemented() {
    return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).body(null);
  }
}
