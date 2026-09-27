package ru.hackathon.tram.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "depot")
public class Depot {

  @Id
  @Column(name = "depot_id")
  private Integer depotId;

  @Column(name = "depot_name", nullable = false)
  private String depotName;

  protected Depot() {}

  public Integer getDepotId() {
    return depotId;
  }

  public String getDepotName() {
    return depotName;
  }
}
