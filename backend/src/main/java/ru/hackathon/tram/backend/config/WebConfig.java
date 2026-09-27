package ru.hackathon.tram.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.format.FormatterRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import ru.hackathon.tram.backend.generated.model.DecisionStatusCode;
import ru.hackathon.tram.backend.generated.model.Horizon;

/**
 * Enum-параметры запроса (horizon=day, status=awaiting) не биндятся Spring'ом по умолчанию:
 * значения в openapi.yaml — нижний регистр, а константы сгенерированного enum — верхний
 * (Horizon.DAY), Spring же пробует точный Enum.valueOf("day") и падает в 400. Регистрируем
 * конвертацию через собственный fromValue() каждого enum.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

  @Override
  public void addFormatters(FormatterRegistry registry) {
    registry.addConverter(String.class, Horizon.class, Horizon::fromValue);
    registry.addConverter(String.class, DecisionStatusCode.class, DecisionStatusCode::fromValue);
  }
}
