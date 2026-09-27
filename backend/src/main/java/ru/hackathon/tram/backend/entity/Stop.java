package ru.hackathon.tram.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "stop")
public class Stop {

  @Id
  @Column(name = "stop_id")
  private Integer stopId;

  @Column(name = "stop_name", nullable = false)
  private String stopName;

  @Column(name = "stop_lat", nullable = false)
  private BigDecimal stopLat;

  @Column(name = "stop_lon", nullable = false)
  private BigDecimal stopLon;

  protected Stop() {}

  public Integer getStopId() {
    return stopId;
  }

  public String getStopName() {
    return stopName;
  }

  public BigDecimal getStopLat() {
    return stopLat;
  }

  public BigDecimal getStopLon() {
    return stopLon;
  }
}
