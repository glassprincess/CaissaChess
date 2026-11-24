(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CaissaSounds = api.create();
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const files = {"castle":"castle.mp3", "game-end":"game-end.webm", "game-start":"game-start.mp3",
    "check":"move-check.mp3", "move":"move-opponent.mp3", "premove":"premove.mp3",
    "promote":"promote.mp3", "tenseconds":"tenseconds.mp3"};
  function create(options) {
    options = options || {};
    let context = options.context || null, settings = options.getSettings || function () {return {sound:true,volume:85};};
    const buffers = Object.create(null), loading = Object.create(null);
    function audioContext() {
      if (!context) { const Constructor = root.AudioContext || root.webkitAudioContext; if (Constructor) context = new Constructor(); }
      return context;
    }
    function load(name) {
      if (buffers[name]) return Promise.resolve(buffers[name]);
      if (loading[name]) return loading[name];
      let ctx;
      try {ctx=audioContext();} catch(e) {return Promise.resolve(null);}
      if (!ctx || !files[name]) return Promise.resolve(null);
      loading[name] = (options.fetch || root.fetch)("sounds/"+files[name]).then(function(response) {
        if (!response.ok) throw new Error("sound");
        return response.arrayBuffer();
      }).then(function(bytes) {
        return new Promise(function(resolve,reject) {ctx.decodeAudioData(bytes,resolve,reject);});
      }).then(function(buffer) {buffers[name]=buffer;return buffer;},function() {delete loading[name];return null;});
      return loading[name];
    }
    function play(name, volume) {
      const s=settings();
      if (!s.sound || (volume===undefined?s.volume:volume)===0 || !files[name]) return Promise.resolve();
      const level=Math.max(0,Math.min(100,volume===undefined?s.volume:volume))/100;
      return load(name).then(function(buffer) {
        if(!buffer)return;
        const current=settings(),ctx=audioContext();
        if(!current.sound || (volume===undefined?current.volume:volume)===0)return;
        return new Promise(function(resolve) {
          const source=ctx.createBufferSource(),gain=ctx.createGain();
          source.buffer=buffer;gain.gain.value=level;source.connect(gain);gain.connect(ctx.destination);
          source.onended=resolve;
          // A suspended/hidden WebView may omit onended; never hold the result window forever.
          const timeout=setTimeout(resolve,Math.ceil(buffer.duration*1000)+400);
          source.onended=function(){clearTimeout(timeout);resolve();};
          try{source.start();}catch(e){clearTimeout(timeout);resolve();}
        });
      });
    }
    function eventForMove(row) {
      if(/[+#]/.test(row.san))return "check";
      if(/^O-O/.test(row.san))return "castle";
      if(row.san.indexOf("=")>=0)return "promote";
      return "move";
    }
    return {configure:function(getSettings){settings=getSettings;},
      preload:function(){return Promise.all(Object.keys(files).map(load));},
      unlock:function(){try{const ctx=audioContext();return ctx && ctx.state==="suspended"?ctx.resume():Promise.resolve();}catch(e){return Promise.resolve();}},
      play:play,eventForMove:eventForMove};
  }
  return {create:create};
});
