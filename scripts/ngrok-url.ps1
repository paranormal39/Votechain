try {
  $t = Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels'
  foreach ($tun in $t.tunnels) {
    "PUBLIC_URL: {0}  ->  {1}" -f $tun.public_url, $tun.config.addr
  }
} catch {
  'NGROK_API_UNREACHABLE: ' + $_.Exception.Message
}
