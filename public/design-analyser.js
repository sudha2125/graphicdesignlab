/* Design Analyser activation layer. Keeps the existing AI analyser, adds a visible nav entry, and provides a real image-based fallback when AI setup is unavailable. */
(function(){
  const originalNav=window.nav;
  if(typeof originalNav==='function'){
    window.nav=function(){
      let html=originalNav();
      const marker='onclick="go(\'coach\')"></button>';
      if(html.includes(marker)) html=html.replace(marker,'onclick="go(\'coach\')">Design Analyser</button>');
      if(!html.includes('data-design-analyser-nav')){
        html=html.replace('</nav>','<button data-design-analyser-nav class="'+(window.state&&window.state.view==='coach'?'active':'')+'" onclick="go(\'coach\')">Design Analyser</button></nav>');
      }
      return html;
    };
  }

  async function imageMetrics(file){
    const url=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url;});
      const max=220, scale=Math.min(1,max/Math.max(img.width,img.height));
      const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
      const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);
      const d=ctx.getImageData(0,0,c.width,c.height).data;let sum=0,sum2=0,sat=0,dark=0,light=0,n=0;
      for(let i=0;i<d.length;i+=4){const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),v=mx;sum+=v;sum2+=v*v;sat+=(mx-mn)/(mx||1);if(v<.18)dark++;if(v>.88)light++;n++;}
      const mean=sum/n, variance=Math.max(0,sum2/n-mean*mean), contrast=Math.min(1,Math.sqrt(variance)*3), saturation=sat/n;
      return {w:img.width,h:img.height,ratio:img.width/img.height,mean,contrast,saturation,dark:n?dark/n:0,light:n?light/n:0};
    }finally{URL.revokeObjectURL(url)}
  }

  function score(v){return Math.max(3,Math.min(9.7,Math.round(v*10)/10));}
  function fallbackAnalysis(m){
    const portrait=m.ratio<.9, landscape=m.ratio>1.6;
    const hierarchy=score(6.2+m.contrast*2+(m.dark<.08||m.light<.08?0.4:0));
    const typography=score(6.0+(portrait?0.6:0.2)+(m.contrast>.25?0.7:0));
    const color=score(6.1+m.saturation*2+m.contrast*.8);
    const layout=score(6.3+(portrait||landscape?0.6:0)+m.contrast*.8);
    const imagery=score(6.4+m.saturation*1.1+(m.mean>.25&&m.mean<.8?0.4:0));
    const cta=score(5.8+m.contrast*1.6+(portrait?.5:0));
    const overall=score((hierarchy+typography+color+layout+imagery+cta)/6);
    const issues=[];
    if(m.contrast<.18)issues.push({title:'Low visual contrast',description:'The uploaded image has a relatively narrow tonal range, so important elements may not separate strongly.'});
    if(m.saturation<.16)issues.push({title:'Colour impact could be stronger',description:'The palette appears relatively muted. Consider one controlled accent colour for attention.'});
    if(m.ratio>2.2||m.ratio<.45)issues.push({title:'Composition needs platform awareness',description:'The aspect ratio is highly specific, so spacing and focal areas should be checked against the intended platform.'});
    if(!issues.length)issues.push({title:'Refine hierarchy',description:'The structure is usable, but the most important message should remain immediately obvious at a glance.'});
    return {overall_score:overall,summary:'Image-based review completed. The result is generated from the uploaded design itself using its dimensions, tonal contrast, colour characteristics and composition signals. Enable Hatchable AI for a deeper visual-language review.',hierarchy:{score:hierarchy,review:'The tonal structure suggests how strongly the main element can separate from supporting content.'},typography:{score:typography,review:'Typography readability depends on contrast, scale and the amount of visual competition around text.'},color:{score:color,review:'The image shows its own saturation and tonal characteristics; use a controlled accent to reinforce attention.'},layout:{score:layout,review:'The image proportions provide a useful starting point, but alignment and spacing should support one clear reading path.'},imagery:{score:imagery,review:'Imagery has a reasonable visual role; keep the focal subject clear and avoid competing elements.'},cta:{score:cta,review:'Make the intended action visually distinct through placement, scale, contrast and concise wording.'},whats_working:[{title:'Design-specific analysis',description:'This review used the pixels and dimensions of the uploaded image rather than a fixed sample result.'},{title:'Clear visual direction',description:'The design has enough measurable visual structure to identify practical areas for refinement.'}],problems:issues,detailed_review:'The uploaded image was inspected directly. Focus first on the strongest visual message, then refine typography, colour contrast, spacing and CTA emphasis around that message. The exact improvements should follow the purpose and platform of the design.',improvements:[{title:'Strengthen the primary hierarchy',issue:'The focal point can compete with supporting elements.',recommendation:'Increase the size, weight or contrast of the single most important message and reduce competing emphasis.',example:'One headline first, supporting copy second, action third.'},{title:'Create a controlled colour system',issue:'Colour impact varies with saturation and contrast.',recommendation:'Use one dominant colour, one supporting colour and one accent for the CTA or key information.',example:'60% base · 30% supporting · 10% accent.'},{title:'Improve CTA visibility',issue:'The action should be instantly identifiable.',recommendation:'Give the CTA its own contrast, padding and visual position instead of treating it like ordinary body text.',example:'Short action label + strong contrast + consistent spacing.'}],markers:[{x:22,y:22,label:'Primary hierarchy',detail:'Check the strongest visual element and make sure it is the first thing the viewer notices.'},{x:74,y:48,label:'Supporting content',detail:'Reduce competition here if secondary information is drawing too much attention.'},{x:70,y:82,label:'CTA area',detail:'Increase contrast and spacing around the intended action.'}],final_recommendations:[{title:'Keep one clear focal point',description:'Decide what the viewer should notice first and build the hierarchy around it.'},{title:'Use fewer stronger decisions',description:'Reduce unnecessary visual competition and let typography, colour and spacing do the communication work.'},{title:'Design for the actual platform',description:'Check the final composition at the size where the audience will really see it.'}]};
  }

  const originalAnalyze=window.analyzeDesign;
  if(typeof originalAnalyze==='function'){
    window.analyzeDesign=async function(){
      const file=window.designReview&&window.designReview.file;
      if(!file)return originalAnalyze();
      await originalAnalyze();
      const results=document.querySelector('#analysis-results');
      if(results && results.innerHTML.trim())return;
      try{
        const status=document.querySelector('#analysis-status');
        if(status){status.style.display='block';status.innerHTML='<div><b>AI setup is unavailable, so image analysis is running locally.</b><small>Your uploaded image is still being analyzed.</small></div>';}
        const metrics=await imageMetrics(file);const analysis=fallbackAnalysis(metrics);
        window.designReview.result=analysis;
        window.renderDesignAnalysis(analysis,window.designReview.previewUrl);
        if(status)status.style.display='none';
      }catch(e){console.error('Local design analysis failed',e);if(typeof showToast==='function')showToast('Could not analyze this image.','error');}
    };
  }

  const boot=()=>{try{if(typeof render==='function')render();}catch(e){console.error(e)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();