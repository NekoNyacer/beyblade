import * as THREE from '/vendor/three.module.js';

// The core stays legible on the white bowl; a separate additive pass makes its halo emit light.
export function createCollisionSparkMaterial(halo=false){
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,toneMapped:false,blending:halo?THREE.AdditiveBlending:THREE.NormalBlending,
    uniforms:{opacity:{value:1},haloPass:{value:halo?1:0},widthScale:{value:halo?1.25:1}},
    vertexShader:`
      uniform float widthScale;
      varying vec2 sparkUv;
      varying vec3 sparkColor;
      void main(){
        sparkUv=uv;
        sparkColor=instanceColor;
        mat4 localView=modelViewMatrix*instanceMatrix;
        vec4 center=localView*vec4(0.0,0.0,0.0,1.0);
        vec3 axis=(localView*vec4(1.0,0.0,0.0,0.0)).xyz;
        vec2 tangent=length(axis.xy)>.0001?normalize(axis.xy):vec2(1.0,0.0);
        float width=length((localView*vec4(0.0,1.0,0.0,0.0)).xyz);
        center.xyz+=axis*position.x;
        center.xy+=vec2(-tangent.y,tangent.x)*position.y*width*widthScale;
        gl_Position=projectionMatrix*center;
      }
    `,
    fragmentShader:`
      uniform float opacity;
      uniform float haloPass;
      varying vec2 sparkUv;
      varying vec3 sparkColor;
      void main(){
        float along=abs(sparkUv.x-.5)*2.0;
        float taper=sqrt(max(0.0,1.0-along*along));
        float across=abs(sparkUv.y-.5)*2.0/max(.035,taper);
        float ends=1.0-smoothstep(.72,1.0,along);
        float halo=exp(-across*across*5.0)*ends;
        float core=exp(-across*across*36.0)*ends;
        float body=exp(-across*across*13.0)*ends;
        float alpha=(haloPass>.5?halo*.18:min(1.0,core*.78+body*.68))*opacity;
        if(alpha<.003)discard;
        vec3 color=haloPass>.5?sparkColor*1.25:mix(sparkColor*1.05,vec3(1.0),core*.94);
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }
    `
  });
}
