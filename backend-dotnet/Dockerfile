FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy csproj and restore as distinct layers
COPY ["backend-dotnet/LMS.Api.csproj", "backend-dotnet/"]
RUN dotnet restore "backend-dotnet/LMS.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/backend-dotnet"
RUN dotnet build "LMS.Api.csproj" -c Release -o /app/build

# Publish application
FROM build AS publish
RUN dotnet publish "LMS.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Build runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=publish /app/publish .

# Render defaults to port 8080
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080

ENTRYPOINT ["dotnet", "LMS.Api.dll"]
