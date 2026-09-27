package ru.hackathon.tram.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import ru.hackathon.tram.backend.service.DecisionGenerationService;

/**
 * Прогоняется при каждом старте (после ReferenceDataSeeder — нужен decision_status). Пересчитывает
 * решения по текущему активному прогнозу — так задумана архитектура (CLAUDE.md раздел 6.5: прогнозы
 * и решения считаются заранее, пакетно; API только читает).
 */
@Component
@Order(2)
public class DecisionGenerationRunner implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(DecisionGenerationRunner.class);

  private final DecisionGenerationService decisionGenerationService;

  public DecisionGenerationRunner(DecisionGenerationService decisionGenerationService) {
    this.decisionGenerationService = decisionGenerationService;
  }

  @Override
  public void run(ApplicationArguments args) {
    int created = decisionGenerationService.generate();
    log.info("Сгенерировано решений: {}", created);
  }
}
