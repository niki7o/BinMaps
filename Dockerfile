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


FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Fix: Microsoft.Data.SqlClient 5.x native SNI library (libsni.so) was compiled
# against OpenSSL 1.x, but aspnet:8.0 (Debian Bookworm) ships OpenSSL 3.x.
# The version mismatch causes a SIGSEGV (exit code 139) before any .NET code runs.
# libssl1.1 from the Debian Bullseye repo provides the required OpenSSL 1.1 runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libssl-dev \
       libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

EXPOSE 8080

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

ENTRYPOINT ["dotnet", "BinMaps.API.dll"]
