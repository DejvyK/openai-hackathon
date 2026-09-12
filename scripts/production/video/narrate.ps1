param([string]$InputJson)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'en-*' } | Sort-Object { if ($_.VoiceInfo.Name -like '*Zira*') { 0 } else { 1 } } | Select-Object -First 1
  if (-not $voice) { throw 'No installed English System.Speech voice' }
  $synth.SelectVoice($voice.VoiceInfo.Name)
  $jobs = Get-Content -Raw -Encoding UTF8 -LiteralPath $InputJson | ConvertFrom-Json
  foreach ($job in $jobs) {
    $synth.Rate = $job.rate
    $synth.SetOutputToWaveFile($job.path)
    $synth.Speak($job.text)
    $synth.SetOutputToNull()
  }
  Write-Output $voice.VoiceInfo.Name
} finally { $synth.Dispose() }
