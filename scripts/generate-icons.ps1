Add-Type -AssemblyName System.Drawing

$iconDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\icons"))
[System.IO.Directory]::CreateDirectory($iconDirectory) | Out-Null

function New-InvestmentIcon([int]$size, [string]$path) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#080d19"))

  $colors = @("#34d399", "#60a5fa", "#fb923c")
  $centers = @(0.285, 0.5, 0.715)
  $radius = $size * 0.133
  for ($index = 0; $index -lt 3; $index += 1) {
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($colors[$index]))
    $cx = $size * $centers[$index]
    $cy = $size * 0.5
    $graphics.FillEllipse($brush, $cx - $radius, $cy - $radius, $radius * 2, $radius * 2)
    $brush.Dispose()

    $points = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
    for ($point = 0; $point -lt 10; $point += 1) {
      $angle = -[Math]::PI / 2 + $point * [Math]::PI / 5
      $starRadius = if ($point % 2 -eq 0) { $radius * 0.58 } else { $radius * 0.25 }
      $points.Add((New-Object System.Drawing.PointF([single]($cx + [Math]::Cos($angle) * $starRadius), [single]($cy + [Math]::Sin($angle) * $starRadius))))
    }
    $starBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#06101d"))
    $graphics.FillPolygon($starBrush, $points.ToArray())
    $starBrush.Dispose()
  }

  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-InvestmentIcon 192 (Join-Path $iconDirectory "icon-192.png")
New-InvestmentIcon 512 (Join-Path $iconDirectory "icon-512.png")

