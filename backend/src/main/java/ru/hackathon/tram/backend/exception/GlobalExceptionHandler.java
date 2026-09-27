package ru.hackathon.tram.backend.exception;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import ru.hackathon.tram.backend.generated.model.Error;
import ru.hackathon.tram.backend.generated.model.ErrorDetailsInner;

/**
 * Единый формат ошибок — тело ответа всегда Error (components.schemas.Error в docs/openapi.yaml).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Error> handleApiException(ApiException ex) {
    return ResponseEntity.status(ex.code().httpStatus())
        .body(toError(ex.code(), ex.getMessage(), ex.details()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<Error> handleValidation(MethodArgumentNotValidException ex) {
    List<ErrorDetailsInner> details =
        ex.getBindingResult().getFieldErrors().stream()
            .map(fe -> new ErrorDetailsInner(fe.getField(), fe.getDefaultMessage()))
            .toList();
    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
        .body(toError(ErrorCode.VALIDATION_ERROR, "Некорректные параметры запроса", details));
  }

  @ExceptionHandler({
    MethodArgumentTypeMismatchException.class,
    MissingServletRequestParameterException.class,
    HttpMessageNotReadableException.class
  })
  public ResponseEntity<Error> handleBadRequest(Exception ex) {
    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
        .body(toError(ErrorCode.VALIDATION_ERROR, "Некорректные параметры запроса", List.of()));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Error> handleUnexpected(Exception ex) {
    log.error("Внутренняя ошибка сервиса", ex);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(
            toError(
                ErrorCode.INTERNAL_ERROR, "Внутренняя ошибка. Повторите запрос позже", List.of()));
  }

  private Error toError(ErrorCode code, String message, List<ErrorDetailsInner> details) {
    Error error = new Error(Error.CodeEnum.valueOf(code.name()), message);
    return details.isEmpty() ? error : error.details(details);
  }
}
