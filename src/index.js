import * as THREE from 'three';
// import THREEcap from 'threecap';
// import EffectComposer from 'three/examples/jsm/postprocessing/EffectComposer.js'

import vertexShader from '../static/main.vert';
import fragmentShader from '../static/main.frag';

let camera, scene, renderer;
let videoTexture, video;
let audio, audioCtx, analyser, source;
let uniforms;
let loaded = false;

const promptEl = document.getElementById('promptEl');

promptEl.onclick = () => {
  promptEl.remove()
  if(!loaded) {
    loaded = true;
    init();
  }
};

async function init() {
  const container = document.getElementById( 'container' );

  camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );

  scene = new THREE.Scene();

  const geometry = new THREE.PlaneGeometry( 2, 2 );

  uniforms = {
    time: { value: 1.0 },
    fft: { value: (new Float32Array(512)).fill(0) },
    ar: { value: 1.0 },
    zoom: { value: 1.0 },
    lights: {value: 64.0 }
  };

  const material = new THREE.ShaderMaterial( {
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
  } );
  material.transparent = true;

  const mesh = new THREE.Mesh( geometry, material );
  scene.add( mesh );

  renderer = new THREE.WebGLRenderer({
    alpha: true
  });
  renderer.setPixelRatio( window.devicePixelRatio );
  document.body.appendChild( renderer.domElement );
  // var composer = new EffectComposer(renderer);

  // var threecap = new THREEcap();
  // threecap.record({
  //   width: 640,
  //   height: 480,
  //   fps: 25,
  //   time: 10,
  //   format: 'mp4',
  //   //canvas: canvasDomElement,   // optional, slowest
  //   composer: composer // optional, fastest
  // }).then(function(video) {
  //   video.saveFile('myVideo.mp4');
  // });
  
  onWindowResize();

  window.addEventListener( 'resize', onWindowResize );

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  audio = new Audio('/static/audio.mp3');
  audio.play();

  // video = document.getElementById('video');
  // video.play();
  source = audioCtx.createMediaElementSource(audio);
  
  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  // videoTexture = new THREE.VideoTexture(video);
  // const videoMaterial =  new THREE.MeshBasicMaterial( {map: videoTexture, side: THREE.FrontSide, toneMapped: false} );

  // videoTexture = new THREE.VideoTexture(video);

  // scene.background = videoTexture;

  animate();
}

function onWindowResize() {
  let w = window.innerWidth;
  let h = window.innerHeight;
  renderer.setSize( w, h );
  uniforms.ar.value = h / w;

  let canvas = document.querySelector('canvas');
  canvas.style.backgroundImage = 'url("/static/image.png")';
  canvas.style.backgroundPosition = 'center';
}

let lastZoom = 0.5;

function animate() {
  requestAnimationFrame( animate );

  let oldTime = uniforms[ 'time' ].value;
  uniforms[ 'time' ].value = performance.now() / 1000;
  let deltaTime = uniforms[ 'time' ].value - oldTime;

  let bufferLength = analyser.frequencyBinCount;
  let dataArray = new Float32Array(bufferLength);
  let desiredMinFreq = 1000;
  let desiredMaxFreq = 2500;
  let maxFreq = audioCtx.sampleRate / 2;
  analyser.getFloatFrequencyData(dataArray);
  let fftInterp = 0.03;

  for(var i = 0; i < 512; i++) {
    let currentFreq = Math.exp((i / 512 * (Math.log(desiredMaxFreq) - Math.log(desiredMinFreq))) + Math.log(desiredMinFreq));
    let pos = currentFreq / maxFreq * bufferLength;
    let oldValue = uniforms['fft'].value[i];
    let newValue = Math.abs(dataArray[Math.floor(pos)] / 25);
    uniforms[ 'fft' ].value[i] = newValue * fftInterp + oldValue * (1 - fftInterp);

    let merged = 512 / uniforms.lights.value;
    for(let i = 0; i < 512; i += merged) {
      let average = 0;
      for(let j = 0; j < merged; j++) {
        let value = uniforms[ 'fft' ].value[i+j];
        if(!isNaN(value)) {
          average += value / merged;
        }
      }
      for(let j = 0; j < merged; j++) {
        uniforms[ 'fft' ].value[i+j] = average;
      }
    }
  }

  let avg = 0;
  for(let i = 0; i < 512; i++) {
    avg += uniforms[ 'fft' ].value[i] ** 2 / 512;
  }
  avg = Math.sqrt(avg);

  // let interpAvg = 0.99 * (lastAvg - avg) + avg;
  for(let i = 0; i < 512; i++) {
    let x = uniforms[ 'fft' ].value[i];
    // uniforms[ 'fft' ].value[i] = 1 / (1 + Math.exp(x - avg));
    uniforms[ 'fft' ].value[i] = (x - avg) / (avg + 2);
  }
  // lastAvg = interpAvg;
  // console.log(avg);

  // console.log(uniforms[ 'fft' ].value.reduce((a, b) => a + b));

  let sumData = dataArray
    .map(Math.abs)
    .reduce((a, b) => a + b) / bufferLength;
  let volume = 1 / sumData;
  let zoom = volume / 0.0125;
  zoom -= 1
  zoom = 1 / (1 + Math.exp(-2.5 * zoom));
  let sensitivity = 3.0;
  zoom *= sensitivity;
  zoom += 0.5
  zoom /= sensitivity;
  let scale = 1.25;
  zoom *= scale;
  let minRealisticAfterSigmoid = 0.4;
  let minZoom = (minRealisticAfterSigmoid * sensitivity + 0.5) / sensitivity * scale;

  if(zoom < minZoom) {
    zoom = minZoom;
  }

  let zoomTimeInterp = 0.25;
  if(isFinite(zoom)) {
    lastZoom = zoom * zoomTimeInterp + lastZoom * (1 - zoomTimeInterp);
  }

  zoom = lastZoom;

  uniforms.zoom.value = Math.pow(zoom * 1.25, 0.8);

  let canvas = document.querySelector('canvas');

  canvas.style.backgroundSize = 135 * Math.pow(zoom, 0.1) + '%';

  renderer.render( scene, camera );
}
