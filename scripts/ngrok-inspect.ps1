try {
  $r = Invoke-RestMethod 'http://127.0.0.1:4040/api/requests/http?limit=200'
  $hits = $r.requests | Where-Object { $_.request.uri -like '*discord*' }
  if (-not $hits) { 'NO_DISCORD_REQUESTS_IN_HISTORY (tunnel saw none)'; return }
  foreach ($req in $hits) {
    $dur = [math]::Round($req.duration / 1e6, 0)
    "{0,-5} {1,-45} status={2} dur={3}ms" -f $req.request.method, $req.request.uri, $req.response.status, $dur
  }
} catch {
  'NGROK_INSPECTOR_UNREACHABLE: ' + $_.Exception.Message
}
