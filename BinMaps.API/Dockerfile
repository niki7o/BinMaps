FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src


COPY *.sln ./

COPY BinMaps.API/BinMaps.API.csproj BinMaps.API/
COPY BinMaps.Data/BinMaps.Data.csproj BinMaps.Data/
COPY BinMaps.Infrastructure/BinMaps.Infrastructure.csproj BinMaps.Infrastructure/
COPY BinMaps.Shared/BinMaps.Shared.csproj BinMaps.Shared/


RUN dotnet restore BinMaps.API/BinMaps.API.csproj


COPY . .

WORKDIR /src/BinMaps.API
RUN dotnet publish -c Release -o /app/publish --no-restore


FROM mcr.microsoft.com/dotnet/aspnet:8.0-bookworm-slim AS runtime
WORKDIR /app

COPY --from=build /app/publish .

EXPOSE 8080

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

ENTRYPOINT ["dotnet", "BinMaps.API.dll"]