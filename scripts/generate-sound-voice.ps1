param([string]$OutputDirectory = '.qa/sound-voice-source')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetFullPath($OutputDirectory)) | Out-Null
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.SelectVoice('Microsoft Zira Desktop')
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono)
$words = @{countdown_3='Three!';countdown_2='Two!';countdown_1='One!';announcer_go='Go!';announcer_shoot='Shoot!'}
foreach ($key in $words.Keys) {
  $speaker.Rate = if ($key -eq 'announcer_go') {-5} elseif ($key -eq 'announcer_shoot') {1} else {0}
  $target = Join-Path ([System.IO.Path]::GetFullPath($OutputDirectory)) ($key + '.wav')
  $speaker.SetOutputToWaveFile($target,$format)
  $speaker.Speak($words[$key])
  $speaker.SetOutputToNull()
  Write-Output $target
}
$speaker.Dispose()
