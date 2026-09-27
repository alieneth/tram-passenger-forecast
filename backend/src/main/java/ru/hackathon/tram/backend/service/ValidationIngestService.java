package ru.hackathon.tram.backend.service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import ru.hackathon.tram.backend.generated.model.IngestResult;
import ru.hackathon.tram.backend.generated.model.IngestResultErrorsInner;
import ru.hackathon.tram.backend.generated.model.ValidationBatch;
import ru.hackathon.tram.backend.generated.model.ValidationRecord;

/** Потоковый приём валидаций (CLAUDE.md раздел 7) — до 5000 записей за раз, source='stream'. */
@Service
public class ValidationIngestService {

  private final JdbcTemplate jdbcTemplate;

  public ValidationIngestService(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public IngestResult ingest(ValidationBatch batch) {
    Set<Integer> knownRoutes =
        new HashSet<>(jdbcTemplate.queryForList("SELECT route FROM route", Integer.class));

    List<ValidationRecord> items = batch.getItems();
    List<IngestResultErrorsInner> errors = new ArrayList<>();
    int accepted = 0;

    for (int i = 0; i < items.size(); i++) {
      ValidationRecord item = items.get(i);
      if (!knownRoutes.contains(item.getRoute())) {
        errors.add(
            new IngestResultErrorsInner(i, "route", "Маршрут " + item.getRoute() + " не найден"));
        continue;
      }
      try {
        insert(item);
        accepted++;
      } catch (DataAccessException e) {
        errors.add(new IngestResultErrorsInner(i, "tran_no", "Не удалось сохранить запись"));
      }
    }
    return new IngestResult(accepted, items.size() - accepted, errors);
  }

  private void insert(ValidationRecord item) {
    Integer garageNumber = item.getGarageNumber().orElse(null);
    if (garageNumber != null) {
      jdbcTemplate.update(
          "INSERT INTO vehicle (garage_number) VALUES (?) ON CONFLICT (garage_number) DO NOTHING",
          garageNumber);
    }
    jdbcTemplate.update(
        "INSERT INTO validation (tran_no, device_no, tran_date_time, begin_date_time, crd_hashcode, "
            + "validation_result, tran_type_id, good_type, pass_route, route, bus_exit_no, garage_number, source) "
            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stream')",
        item.getTranNo(),
        item.getDeviceNo(),
        toLocalDateTime(item.getTranDateTime()),
        toLocalDateTime(item.getBeginDateTime().orElse(null)),
        item.getCrdHashcode(),
        item.getValidationResult(),
        item.getTranTypeId().orElse(null),
        item.getGoodType().orElse(null),
        item.getPassRoute().orElse(null),
        item.getRoute(),
        item.getBusExitNo().orElse(null),
        garageNumber);
  }

  /** Время в данных — московское без часового пояса (CLAUDE.md раздел 5); смещение отбрасываем. */
  private java.time.LocalDateTime toLocalDateTime(OffsetDateTime value) {
    return value == null ? null : value.toLocalDateTime();
  }
}
