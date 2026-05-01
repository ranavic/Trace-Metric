param(
  [int]$Requests = 80,
  [string]$BaseUrl = "http://localhost:3001"
)

$paths = @("/", "/", "/", "/slow", "/fail", "/health")

Write-Host "Sending $Requests requests to $BaseUrl ..."

for ($i = 1; $i -le $Requests; $i++) {
  $path = Get-Random -InputObject $paths
  $url = "$BaseUrl$path"

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5
    Write-Host "$i`t$($response.StatusCode)`t$path"
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    if (-not $status) {
      $status = "ERR"
    }
    Write-Host "$i`t$status`t$path"
  }

  Start-Sleep -Milliseconds (Get-Random -Minimum 80 -Maximum 320)
}

Write-Host "Done. Check Prometheus, Grafana, Alertmanager, and Kibana."
