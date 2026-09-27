package ru.hackathon.tram.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Служебные справочники, которые не зависят от датасета организаторов — decision_status (9 статусов
 * из контракта) и setting (бизнес-параметры). Сеется при каждом старте, идемпотентно, чтобы
 * работало сразу после docker compose up без ручных шагов (см.
 * docs/instrukciya-dlya-zhyuri.md). @Order(1) — DecisionGenerationRunner читает decision_status,
 * должен стартовать после этого.
 */
@Component
@Order(1)
public class ReferenceDataSeeder implements ApplicationRunner {

  private static final Object[][] DECISION_STATUSES = {
    {1, "generated", "Сгенерировано"},
    {2, "awaiting", "Ожидает решения"},
    {3, "updated", "Обновлено"},
    {4, "accepted", "Принято"},
    {5, "rejected", "Отклонено"},
    {6, "expired", "Просрочено"},
    {7, "executed", "Исполнено"},
    {8, "not_executed", "Не исполнено"},
    {9, "closed", "Закрыто"},
  };

  private final JdbcTemplate jdbcTemplate;
  private final int passengersPerTramNorm;
  private final int tramPrepMinutes;

  public ReferenceDataSeeder(
      JdbcTemplate jdbcTemplate,
      @Value("${app.passengers-per-tram-norm}") int passengersPerTramNorm,
      @Value("${app.tram-prep-minutes}") int tramPrepMinutes) {
    this.jdbcTemplate = jdbcTemplate;
    this.passengersPerTramNorm = passengersPerTramNorm;
    this.tramPrepMinutes = tramPrepMinutes;
  }

  @Override
  public void run(ApplicationArguments args) {
    seedDecisionStatuses();
    seedSetting("PASSENGERS_PER_TRAM_NORM", passengersPerTramNorm, "Норма пассажиров на трамвай");
    seedSetting("TRAM_PREP_MINUTES", tramPrepMinutes, "Время подготовки трамвая к выходу, минут");
  }

  private void seedDecisionStatuses() {
    for (Object[] row : DECISION_STATUSES) {
      jdbcTemplate.update(
          "INSERT INTO decision_status (status_id, status_code, status_name) VALUES (?, ?, ?) "
              + "ON CONFLICT (status_id) DO NOTHING",
          row);
    }
  }

  private void seedSetting(String key, int value, String description) {
    jdbcTemplate.update(
        "INSERT INTO setting (setting_key, setting_value, description) VALUES (?, ?, ?) "
            + "ON CONFLICT (setting_key) DO UPDATE SET "
            + "setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP",
        key,
        String.valueOf(value),
        description);
  }
}
