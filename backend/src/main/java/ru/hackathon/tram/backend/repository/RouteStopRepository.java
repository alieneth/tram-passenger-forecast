package ru.hackathon.tram.backend.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import ru.hackathon.tram.backend.entity.RouteStop;

public interface RouteStopRepository extends JpaRepository<RouteStop, Integer> {

  @Query(
      "SELECT rs FROM RouteStop rs JOIN FETCH rs.stop WHERE rs.route.route = :route "
          + "ORDER BY rs.directionId, rs.stopSequence")
  List<RouteStop> findByRoute(@Param("route") Integer route);
}
