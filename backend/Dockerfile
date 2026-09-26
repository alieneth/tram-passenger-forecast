FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /repo/backend
COPY backend/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY backend/src ./src
COPY docs/openapi.yaml /repo/docs/openapi.yaml
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /repo/backend/target/backend.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
