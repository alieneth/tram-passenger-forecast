package ru.hackathon.tram.backend.exception;

import org.springframework.http.HttpStatus;

/** Коды ошибок API — строго по перечислению components.schemas.Error в docs/openapi.yaml. */
public enum ErrorCode {
  VALIDATION_ERROR(HttpStatus.BAD_REQUEST),
  UNAUTHORIZED(HttpStatus.UNAUTHORIZED),
  FORBIDDEN(HttpStatus.FORBIDDEN),
  ROUTE_NOT_FOUND(HttpStatus.NOT_FOUND),
  GEOMETRY_NOT_FOUND(HttpStatus.NOT_FOUND),
  FORECAST_NOT_FOUND(HttpStatus.NOT_FOUND),
  ACTUALS_NOT_FOUND(HttpStatus.NOT_FOUND),
  DATE_NOT_IN_CALENDAR(HttpStatus.NOT_FOUND),
  DECISION_NOT_FOUND(HttpStatus.NOT_FOUND),
  MODEL_VERSION_NOT_FOUND(HttpStatus.NOT_FOUND),
  INVALID_STATUS_TRANSITION(HttpStatus.CONFLICT),
  DECISION_EXPIRED(HttpStatus.CONFLICT),
  INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR),
  FORECAST_NOT_READY(HttpStatus.SERVICE_UNAVAILABLE);

  private final HttpStatus httpStatus;

  ErrorCode(HttpStatus httpStatus) {
    this.httpStatus = httpStatus;
  }

  public HttpStatus httpStatus() {
    return httpStatus;
  }
}
