varying vec2 vUv;

uniform float time;
uniform float[512] fft;
uniform float ar;
uniform float zoom;
uniform float lights;

vec3 hsv2rgb_smooth( in vec3 c )
{
  vec3 rgb = clamp( abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0 );

  rgb = rgb*rgb*(3.0-2.0*rgb); // cubic smoothing	

  return c.z * mix( vec3(1.0), rgb, c.y);
}
float sigmoid(float x) {
    return 1.0 / (1.0 + exp(-x));
}

float sigmoidstep(float a, float b, float c) {
  float mid = (a + b) / 2.0;
  float size = (b - a) / 2.0;
  float interp = (c - a) / size;
  return sigmoid(interp);
}

float d_sigmoid(float x) {
  return sigmoid(x) * (1.0 - sigmoid(x));
}


void main()
{
  vec2 uv = vUv;
  float PI = 3.14159265;
  
  vec2 centered = vec2((uv.x - 0.5)/ar, uv.y - 0.5);
  centered /= zoom;
  float angle = atan(centered.y, centered.x) / 2.0 / PI;
  float dist = sqrt(dot(centered, centered));
  float rotate = time / 5.0;
  // float hue = angle + rotate;
  float hue = 0.12;
  
  float freqAngle = atan(centered.y, abs(centered.x)) / 2.0 / PI + 0.25;
  // in [0,1]
  freqAngle = 2.0 * (freqAngle + (1.0 - 2.0 * freqAngle) * step(0.5, freqAngle));
  //freqAngle = freqAngle * 0.6 + 0.2;

  float radius = 0.25;
  float distFromCircle = max(dist - radius, 0.1);
  
  float fftSize = 48000.0/1024.0;
  float totalImpact = 0.0;
  float totalAmplitude = 0.0;
  float totalAmpInterp = 0.0;
  float totalInterp = 0.0;
  float totalSqInterp = 0.0;
  float brightness = 0.0;

  
  for(float i=-lights + 2.0; i < lights; i++) {
    float _interp = i / (lights - 1.0);
    float interp = abs(_interp);
    
    float amplitude = fft[int(interp * 512.0)];//texelFetch( iChannel0, ivec2(freq/fftSize,0), 0 ).x;

    // kind of like a polynomial EQ
    float brightnessMapping = 0.5;
    brightnessMapping += 0.64 * pow(interp, 1.0);
    brightnessMapping += 0.24 * pow(interp, 2.0);
    brightnessMapping += -0.93 * pow(interp, 3.0);
    // float brightnessMapping = interp + 0.5;
    brightnessMapping *= 1.25;
 
    float angleDifference = _interp - freqAngle;
    angleDifference += step(angleDifference, -1.0) * 3.0 / brightnessMapping;
    float impact = d_sigmoid(angleDifference * 30.0) * lights;
    
    brightness += impact * amplitude;
    totalImpact += impact;
    if (i >= 0.0) {
      totalAmplitude += amplitude;
      totalInterp += interp;
      totalAmpInterp += interp * amplitude;
      totalSqInterp += interp * interp;
    }
  }

  
  float slope = lights * totalAmpInterp - totalAmplitude * totalInterp;
  slope /= lights * totalSqInterp - totalInterp * totalInterp;
  float intercept = totalAmplitude - slope * totalInterp;
  intercept /= lights;

  float expected = slope * freqAngle + intercept;
  
  brightness /= totalImpact;
  brightness -= expected;
  brightness *= 1.0;
  // brightness *= pow(brightness, 0.5) * 25.0;

  brightness *= pow(zoom, 8.0);


  brightness = max(brightness, 0.0);

  brightness *= pow(distFromCircle, -0.5) * 2.0;


  float minBrightness = 0.01;
  brightness += minBrightness;
  float dist2 = max(dist - 0.25, minBrightness);
  brightness /= dist2;

  float circle = sigmoidstep(0.27, 0.28, dist);
  brightness *= circle;
  brightness += (1.0 - circle) * pow(dist / 0.25, 1.3);

  brightness *= 1.0 + circle;

  brightness = max(brightness, 0.0);
  brightness = min(brightness, 1.0);
  brightness = pow(brightness, 5.0);
  
  vec3 hsvCol = vec3(hue, 0.75, 1.0);
  vec3 col = hsv2rgb_smooth(hsvCol);
  col *= brightness;
  // float backgroundHue = time / 5.0 + 0.1 * (centered.x * cos(PI * 2.0 * time / 20.0) + centered.y * sin(PI * 2.0 * time / 10.0));
  // vec3 backgroundCol = hsv2rgb_smooth(vec3(backgroundHue, 0.6, 0.3));
  vec3 backgroundCol = vec3(0.0, 0.0, 0.0);
  col += backgroundCol * (1.0 - brightness);

  float alpha = max(0.5, brightness);
  // float alpha = 1.0;
  // float alpha = brightness;
  
  // output final color
  gl_FragColor = vec4(col, alpha);
}