package ru.hackathon.tram.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;

@Entity
@Table(name = "route")
public class Route {

  @Id
  @Column(name = "route")
  private Integer route;

  @Column(name = "gtfs_route_id")
  private Integer gtfsRouteId;

  @Column(name = "reg_num")
  private String regNum;

  @Column(name = "route_long_name")
  private String routeLongName;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "depot_id")
  private Depot depot;

  @Column(name = "date_start")
  private LocalDate dateStart;

  @Column(name = "is_new", nullable = false)
  private boolean isNew;

  @Column(name = "has_geometry", nullable = false)
  private boolean hasGeometry;

  protected Route() {}

  public Integer getRoute() {
    return route;
  }

  public String getRouteLongName() {
    return routeLongName;
  }

  public Depot getDepot() {
    return depot;
  }

  public LocalDate getDateStart() {
    return dateStart;
  }

  public boolean isNew() {
    return isNew;
  }

  public boolean isHasGeometry() {
    return hasGeometry;
  }
}
