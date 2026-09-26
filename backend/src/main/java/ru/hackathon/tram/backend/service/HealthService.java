package ru.hackathon.tram.backend.service;

import java.sql.Timestamp;
import java.time.ZoneOffset;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import ru.hackathon.tram.backend.generated.model.Health;

@Service
public class HealthService {

  private static final Logger log = LoggerFactory.getLogger(HealthService.class);

  // Россия — без перехода на летнее время, смещение Москвы фиксированное.
  private static final ZoneOffset MOSCOW_OFFSET = ZoneOffset.ofHours(3);

  private static final String ACTIVE_MODEL_SQL =
      "SELECT mv.version_name AS version_name, MAX(f.created_at) AS generated_at "
          + "FROM model_version mv LEFT JOIN forecast f ON f.model_version_id = mv.model_version_id "
          + "WHERE mv.is_active = true "
          + "GROUP BY mv.version_name";

  private final JdbcTemplate jdbcTemplate;

  public HealthService(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public Health check() {
    try {
      Map<String, Object> row = jdbcTemplate.queryForMap(ACTIVE_MODEL_SQL);
      String versionName = (String) row.get("version_name");
      Timestamp generatedAt = (Timestamp) row.get("generated_at");
      return new Health(Health.StatusEnum.UP, Health.DbEnum.UP)
          .activeModelVersion(versionName)
          .forecastGeneratedAt(
              generatedAt == null ? null : generatedAt.toLocalDateTime().atOffset(MOSCOW_OFFSET));
    } catch (EmptyResultDataAccessException e) {
      // БД доступна, но нет активной версии модели — прогноз ещё не рассчитан
      return new Health(Health.StatusEnum.DEGRADED, Health.DbEnum.UP);
    } catch (DataAccessException e) {
      log.error("БД недоступна", e);
      return new Health(Health.StatusEnum.DOWN, Health.DbEnum.DOWN);
    }
  }
}
