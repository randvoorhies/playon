window.onload = function() {

  if (!Array.prototype.last){
    Array.prototype.last = function(){
      return this[this.length - 1];
    };
  };

  var video = document.getElementById("video");

  var canvas = document.getElementById("scrubber");
  
  var stage = new createjs.Stage("scrubber");
  stage.canvas.width = video.width;
  stage.canvas.height = 300;
  stage.setTransform(
    0, 0,
    stage.canvas.width / video.duration,
    1);

  var ticks = {
    minutes : null,
    seconds : null
  }

  var colors = [
    "#114b5f",
    "#f45b69",
    "#e4fde1",
    "#456990",
    "#028090",
  ];

  var audio_tracks = [
    { audio: document.getElementById("getgot"), video_time: 30.0, audio_in_time: 20.0, audio_out_time: 140.0, visual: null },
    { audio: document.getElementById("talking"), video_time: 20.0, audio_in_time: 10.0, audio_out_time: 50.0, visual: null },
  ];


  // Create the minute ticks
  ticks.minutes = new createjs.Container();
  for(var t=0; t<video.duration; t+=60) {
    var tick = new createjs.Container();

    var tickline = new createjs.Shape();
    tickline.graphics.
      setStrokeStyle(0.25).
      beginStroke('#bbb').
      moveTo(t, 0).
      lineTo(t, stage.canvas.height);
    tick.addChild(tickline);

    ticks.minutes.addChild(tick);
  }
  stage.addChild(ticks.minutes);
  stage.update();


  // Add all of the audio tracks
  var track_height = Math.min(100, stage.canvas.height / audio_tracks.length);
  for(var i=0; i<audio_tracks.length; ++i) {
    var track = audio_tracks[i];
    track.visual = new createjs.Container();
    var color = colors[i % colors.length];

    var whole_track = new createjs.Shape();
    whole_track.graphics.beginFill(color).drawRect(
      track.video_time,
      i * track_height,
      track.audio.duration,
      track_height);
    whole_track.alpha = 0.6;
    track.visual.addChild(whole_track);

    var track_playable = new createjs.Shape();
    track_playable.graphics.beginFill(color).drawRect(
      track.video_time + track.audio_in_time,
      i * track_height,
      Math.min(track.audio.duration, track.audio_out_time - track.audio_in_time),
      track_height);
    track.visual.addChild(track_playable);

    var track_text = new createjs.Text(track.audio.src.split('/').last(), "16px Arial", "#000");
    track_text.x = track.video_time;
    track_text.y = i * track_height + track_height;
    track_text.textBaseline = "bottom";
    track_text.maxWidth = track.audio.duration;
    track.visual.addChild(track_text);

    stage.addChild(track.visual);
    console.log(track.visual);
  }



  // Add the scrubber line
  var scrubber = new createjs.Container();

  var scrubber_middle = new createjs.Shape();
  scrubber_middle.graphics.setStrokeStyle(1).beginStroke("#222").moveTo(0, 0).lineTo(0, stage.canvas.height);
  scrubber.addChild(scrubber_middle);

  stage.addChild(scrubber);

  stage.update();

  createjs.Ticker.addEventListener("tick", update);
  createjs.Ticker.setFPS(40);
  function update(event) {
    scrubber.x = video.currentTime;
    stage.update();

    // Go through all tracks and see if anyone needs to be paused
    for(var i=0; i<audio_tracks.length; ++i) {
      var track = audio_tracks[i]
      if(!track.audio.paused && video.currentTime > (track.video_time + track.audio_out_time)) {
        track.audio.pause();
        console.log('Pausing track', track);
      }
    }
  }


  var queued_events = [];

  video.onplay = function() {

    function play_track(track) {
      // Sometimes our queued timeouts fire too early. If we are too early, then just requeue ourselves
      var current_audio_time = video.currentTime - track.video_time;
      if(current_audio_time < track.audio_in_time) {
        var delay_time = (track.audio_in_time - current_audio_time) * 1000;
        console.log('Repushing early play event: ' + delay_time.toString() + 'ms', track.audio_in_time, current_audio_time);
        setTimeout(play_track.bind(null, track), delay_time)
        return;
      }

      // Calculate the current time in audio coordinates
      track.audio.currentTime = current_audio_time + track.audio_in_time;

      console.log('Playing track',
                  track, 
                  ((video.currentTime - (track.video_time + track.audio_in_time)) * 1000).toString() + 'ms late' );

      // Play the track
      track.audio.play();
    }

    var now = video.currentTime;
    for(var i=0; i<audio_tracks.length; ++i) {
      track = audio_tracks[i];

      // If the current time is before the audio start time, then queue a timer event
      // to play the track later
      var delay_time = (track.video_time + track.audio_in_time - now);
      if(delay_time > 0) {
        console.log('Pushing play event', track, delay_time);
        queued_events.push(setTimeout(play_track.bind(null, audio_tracks[i]), delay_time * 1000));
      }
      else {
        // TODO: Should we check to see if we are past the audio track end?
        console.log('Playing track now', track, track.video_time - now);
        play_track(track);
      }
    }
  };

  video.onpause = function() { 
    console.log('Pausing!');

    // Pause all of the audio tracks
    for(var i=0; i<audio_tracks.length; ++i) {
      audio_tracks[i].audio.pause();
    }

    // Clear any queued audio events
    for(var j=0; j<queued_events.length; ++j) {
      clearTimeout(queued_events[j]);
    }
  };

  // When we seek, we should do the same thing as a pause and play
  video.onseeked = function() {
    video.onpause();
    if(!video.paused) { video.onplay(); }
  }


  canvas.addEventListener("mousewheel", on_mouse_wheel, false);
  canvas.addEventListener("DOMMouseScroll", on_mouse_wheel, false);

  function get_mouse_timeline() {
    var mat = stage.getMatrix();
    var scale = 1.0 / mat.a;
    var translation = mat.tx;
    //console.log(stage.getMatrix());
    return scale * (stage.mouseX - translation);
  }
  
  function on_mouse_wheel(e) {
    var zoom = 1.02;
    if(Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail))) < 0) {
      zoom = 1.0 / zoom;
    }

    var timeline_x = get_mouse_timeline();

    stage.scaleX *= zoom;
    stage.regX = (timeline_x + stage.mouseX);
    stage.x = stage.regX

    // Find all of the text labels, and rescale them 1:1 aspect ratio
    for(var i=0; i<audio_tracks.length; ++i) {
      track = audio_tracks[i];
      text_element = _.find(track.visual.children, function(c) { return _.has(c, 'font'); });
      text_element.scaleY = stage.scaleX;
      console.log(text_element);
    }

    stage.update();
  }

  stage.addEventListener("stagemousedown", function(e) {
    var offset={x:stage.x-e.stageX,y:0};

    stage.addEventListener("stagemousemove",function(ev) {
      stage.x = ev.stageX+offset.x;
      stage.y = 0;
      stage.update();
    });
    stage.addEventListener("stagemouseup", function(){
      stage.removeAllEventListeners("stagemousemove");
    });
  }); 

  stage.on("stagemousedown", function(event) {
    console.log('click', event);
    if(event.nativeEvent.metaKey) {
      video.currentTime = get_mouse_timeline();
    }
  })

};
