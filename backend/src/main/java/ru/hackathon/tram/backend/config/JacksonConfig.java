package ru.hackathon.tram.backend.config;

import org.openapitools.jackson.nullable.JsonNullableModule;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Модели, сгенерированные из openapi.yaml, используют JsonNullable для nullable-полей. */
@Configuration
public class JacksonConfig {

  @Bean
  public JsonNullableModule jsonNullableModule() {
    return new JsonNullableModule();
  }
}
