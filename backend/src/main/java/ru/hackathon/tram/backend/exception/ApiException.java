package ru.hackathon.tram.backend.exception;

import java.util.List;
import ru.hackathon.tram.backend.generated.model.ErrorDetailsInner;

/** Ошибка API с кодом из ErrorCode — единый формат ответа задаёт GlobalExceptionHandler. */
public class ApiException extends RuntimeException {

  private final ErrorCode code;
  private final List<ErrorDetailsInner> details;

  public ApiException(ErrorCode code, String message) {
    this(code, message, List.of());
  }

  public ApiException(ErrorCode code, String message, List<ErrorDetailsInner> details) {
    super(message);
    this.code = code;
    this.details = details;
  }

  public ErrorCode code() {
    return code;
  }

  public List<ErrorDetailsInner> details() {
    return details;
  }
}
