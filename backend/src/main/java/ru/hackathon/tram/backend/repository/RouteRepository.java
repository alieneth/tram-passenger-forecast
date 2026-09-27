package ru.hackathon.tram.backend.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import ru.hackathon.tram.backend.entity.Route;

public interface RouteRepository extends JpaRepository<Route, Integer> {

  @Query("SELECT r FROM Route r LEFT JOIN FETCH r.depot ORDER BY r.route")
  List<Route> findAllWithDepot();

  @Query("SELECT r FROM Route r LEFT JOIN FETCH r.depot WHERE r.isNew = :isNew ORDER BY r.route")
  List<Route> findByIsNewWithDepot(boolean isNew);
}
