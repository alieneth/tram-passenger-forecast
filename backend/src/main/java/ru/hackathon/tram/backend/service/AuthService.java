package ru.hackathon.tram.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import ru.hackathon.tram.backend.exception.ApiException;
import ru.hackathon.tram.backend.exception.ErrorCode;

/**
 * Базовая bearer-авторизация (CLAUDE.md раздел 13.2: "желательна", в т.ч. межсервисная).
 * Полноценный OAuth/JWT — избыточно для MVP; два статических токена по ролям из контракта (роль
 * "Диспетчер" — решения, роль "ingest" — приём валидаций), значения — из переменных окружения, в
 * коде и в git не хранятся.
 */
@Service
public class AuthService {

  private static final String BEARER_PREFIX = "Bearer ";

  private final String ingestToken;
  private final String dispatcherToken;

  public AuthService(
      @Value("${app.auth.ingest-token}") String ingestToken,
      @Value("${app.auth.dispatcher-token}") String dispatcherToken) {
    this.ingestToken = ingestToken;
    this.dispatcherToken = dispatcherToken;
  }

  public void requireIngest(String authorizationHeader) {
    require(authorizationHeader, ingestToken);
  }

  public void requireDispatcher(String authorizationHeader) {
    require(authorizationHeader, dispatcherToken);
  }

  private void require(String authorizationHeader, String expectedToken) {
    String token = bearerToken(authorizationHeader);
    if (token == null) {
      throw new ApiException(ErrorCode.UNAUTHORIZED, "Требуется авторизация");
    }
    if (!expectedToken.equals(token)) {
      throw new ApiException(ErrorCode.FORBIDDEN, "Недостаточно прав для выполнения операции");
    }
  }

  private String bearerToken(String header) {
    if (header == null || !header.startsWith(BEARER_PREFIX)) {
      return null;
    }
    return header.substring(BEARER_PREFIX.length()).trim();
  }
}
