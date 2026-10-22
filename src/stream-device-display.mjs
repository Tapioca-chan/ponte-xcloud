// The requested streaming profile is distinct from the TV screen's physical
// size. VIDAA may need a 1920x1080 CSS video plane to fill the screen while
// decoding a smaller 1280x720 WebRTC stream.
export function xboxAdvertisedDisplay(resolution=720){
 const profile=Number(resolution)===1080?1080:720;
 return profile===1080
  ?{widthInPixels:1920,heightInPixels:1080}
  :{widthInPixels:1280,heightInPixels:720};
}

// Xbox Cloud's 720p client identity must match in both the play payload
// and the X-MS-Device-Info header. 720p: Android; 1080p: Windows.
export function xboxStreamingOsName(resolution=720){
 return Number(resolution)===1080?'windows':'android';
}
