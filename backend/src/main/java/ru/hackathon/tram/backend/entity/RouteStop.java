package ru.hackathon.tram.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "route_stop")
public class RouteStop {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "route_stop_id")
  private Integer routeStopId;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "route", referencedColumnName = "route")
  private Route route;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "stop_id")
  private Stop stop;

  @Column(name = "trip_id", nullable = false)
  private Integer tripId;

  @Column(name = "direction_id", nullable = false)
  private Short directionId;

  @Column(name = "stop_sequence", nullable = false)
  private Short stopSequence;

  protected RouteStop() {}

  public Route getRoute() {
    return route;
  }

  public Stop getStop() {
    return stop;
  }

  public Integer getTripId() {
    return tripId;
  }

  public Short getDirectionId() {
    return directionId;
  }

  public Short getStopSequence() {
    return stopSequence;
  }
}
