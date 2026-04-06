define([
    "require",       
    "qlik",
    "jquery",
    "./three.min" 
],
function (require, qlik, $, THREE_Module) { 
    'use strict';
	
	var moduleBasePath = require.toUrl("./");
    if (moduleBasePath.slice(-1) !== "/") {
        moduleBasePath += "/";
    }

    // --- GLOBAL DEĞİŞKENLER ---
    var renderer, scene, camera;
    var manGroup, stairGroup;
    var animationId;
    var stepData = []; 
    var isDragging = false; 
    
    // --- ARKA PLAN GÖRSELLERİ (DİNAMİK SEÇİM İÇİN) ---
	var bgDesktop = moduleBasePath + "icon/output-onlinepngtools%20(1).png"; 
    var bgMobile = moduleBasePath + "icon/vb.png";

    var parts = {
        leftLegPivot: null, rightLegPivot: null,
        leftKneePivot: null, rightKneePivot: null,
        leftArmPivot: null, rightArmPivot: null,
        leftElbowPivot: null, rightElbowPivot: null,
        briefcase: null
    };
    
    var clock = new THREE_Module.Clock();
    var walkSpeed = 0.5;        
    var stepWidth = 2.0;        
    var stepHeight = 0.7;       
    var startX = -6;            
    var totalSteps = 5; 
    var totalDistance = 0; 

    return {
        initialProperties: {
            qHyperCubeDef: {
                qDimensions: [],
                qMeasures: [],
                qInitialDataFetch: [{ qWidth: 8, qHeight: 1000 }] 
            }
        },
        definition: {
            type: "items",
            component: "accordion",
            items: {
                dimensions: { uses: "dimensions", min: 8, max: 8 },
                settings: { uses: "settings" }
            }
        },
        
        paint: function ($element, layout) {
            var id = "three_container_" + layout.qInfo.qId;
            var width = $element.width();
            var height = $element.height();
            
            // --- 1. MOBİL KONTROLÜ ---
            var isMobile = width < 500;

            // --- 2. TEMİZLİK ---
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            $element.empty(); 
            renderer = null;

            // --- 3. VERİ KONTROLÜ ---
            var qMatrix = layout.qHyperCube.qDataPages[0].qMatrix;
            
            if (!qMatrix || qMatrix.length === 0) {
                showWarning($element, id, "Veri Bulunamadı.", isMobile);
                return qlik.Promise.resolve();
            }

            var uniqueNames = [];
            var seenNames = {};
            qMatrix.forEach(function(row) {
                var name = row[0].qText;
                if (!seenNames[name]) {
                    seenNames[name] = true;
                    uniqueNames.push(name);
                }
            });

            if (uniqueNames.length > 1) {
                showWarning($element, id, "Lütfen Analiz İçin Bir Personel Seçiniz 👆", isMobile);
                return qlik.Promise.resolve();
            }

            var empName = uniqueNames[0]; 
            var tenure = ""; 
            var gender = "Erkek"; 
            stepData = [];

            if (qMatrix[0][2]) tenure = "Süre: " + qMatrix[0][2].qText; 
            if (qMatrix[0][7]) gender = qMatrix[0][7].qText;

            totalSteps = qMatrix.length;
            qMatrix.forEach(function(row) {
                stepData.push({
                    date:  row[3].qText, 
                    info1: row[4].qText, 
                    info2: row[5].qText, 
                    info3: row[6].qText  
                });
            });
            
            totalDistance = (startX + 2 + ((totalSteps - 1) * stepWidth) + (stepWidth/2)) - startX;

            // --- 4. ARAYÜZ (RESPONSIVE ARKA PLAN) ---
            
            // Hangi resmi kullanacağımıza karar veriyoruz
            var activeBgImage = isMobile ? bgMobile : bgDesktop;

            var bgStyle = "width:100%; height:100%; position:absolute; top:0; left:0; overflow:hidden;";
            bgStyle += "background-image: url('" + activeBgImage + "');";
            
            // Mobilde ve Masaüstünde farklı hizalama ayarları
            if (isMobile) {
                bgStyle += "background-size: cover;"; // Dikey resim olduğu için cover tam oturtur
                bgStyle += "background-position: center bottom;"; // Binayı aşağı yasla
            } else {
                bgStyle += "background-size: cover;";
                bgStyle += "background-position: center center;";
            }
            
            bgStyle += "background-repeat: no-repeat;";

            $element.html('<div id="bg_' + id + '" style="' + bgStyle + '"></div>');
            $element.append('<div id="' + id + '" style="width:100%; height:100%; position:absolute; top:0; left:0; z-index:1;"></div>');
            
            var headerFontSize = isMobile ? "11px" : "14px";
            var headerPadding = isMobile ? "6px 10px" : "10px 15px";
            
            var headerHtml = '<div id="header_info_' + layout.qInfo.qId + '" style="position:absolute; top:10px; left:10px; background:white; padding:' + headerPadding + '; border-radius:8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-weight:bold; font-family: sans-serif; font-size:' + headerFontSize + '; color:#2c3e50; z-index:99; white-space:nowrap; max-width:90%; overflow:hidden; text-overflow:ellipsis;">' + 
                             "👤 " + empName + "  |  ⏳ " + tenure + '</div>';
            $element.append(headerHtml);

            var cardTop = isMobile ? "50px" : "70px";
            var cardWidth = isMobile ? "180px" : "220px"; 
            var cardFontDate = isMobile ? "14px" : "18px";
            var cardFont1 = isMobile ? "12px" : "15px";
            var cardFont2 = isMobile ? "10px" : "13px";
            var cardPad = isMobile ? "10px" : "15px";
            var cardBg = isMobile ? "rgba(255, 195, 0, 0.85)" : "rgba(255, 195, 0, 0.95)";

            var cardHtml = '<div id="dynamic_card_' + layout.qInfo.qId + '" style="position:absolute; top:' + cardTop + '; left:10px; background:' + cardBg + '; color:#2c3e50; padding:' + cardPad + '; border-radius:12px; font-family: sans-serif; box-shadow: 0 8px 16px rgba(0,0,0,0.3); z-index:99; min-width: ' + cardWidth + '; max-width: ' + cardWidth + '; text-align:center; transition: all 0.3s ease;">' +
                           '<div id="card_date" style="font-size:' + cardFontDate + '; font-weight:900; margin-bottom:5px; color:#000; border-bottom:2px solid #2c3e50; padding-bottom:3px;">📅 -</div>' +
                           '<div id="card_info1" style="font-size:' + cardFont1 + '; font-weight:700; margin-bottom:2px; line-height:1.2;">-</div>' +
                           '<div id="card_info2" style="font-size:' + cardFont2 + '; font-weight:500; line-height:1.2;">-</div>' +
                           '<div id="card_info3" style="font-size:' + cardFont2 + '; font-weight:400; font-style:italic; margin-top:3px; line-height:1.2;">-</div>' +
                           '</div>';
            $element.append(cardHtml);

            var sliderBottom = isMobile ? "30px" : "20px";
            var sliderThumbSize = isMobile ? "35px" : "25px";
            var sliderHeight = isMobile ? "12px" : "8px"; 

            var sliderHtml = '<div style="position:absolute; bottom:' + sliderBottom + '; left:5%; width:90%; z-index:9999;">' +
                             '<input type="range" min="0" max="100" value="0" class="timeline-slider" id="timeline_slider_' + layout.qInfo.qId + '" ' +
                             'style="width:100%; cursor:pointer; -webkit-appearance: none; height: ' + sliderHeight + '; background: rgba(255,255,255,0.6); border-radius: 10px; outline: none; touch-action: none;">' +
                             '</div>';
            
            var sliderStyle = '<style>' +
                              '#timeline_slider_' + layout.qInfo.qId + '::-webkit-slider-thumb {' +
                              '-webkit-appearance: none; appearance: none; width: ' + sliderThumbSize + '; height: ' + sliderThumbSize + '; border-radius: 50%; background: #ffc107; cursor: pointer; border: 3px solid #fff; box-shadow: 0 0 10px rgba(0,0,0,0.5);' +
                              '}' +
                              '#timeline_slider_' + layout.qInfo.qId + '::-moz-range-thumb {' +
                              'width: ' + sliderThumbSize + '; height: ' + sliderThumbSize + '; border-radius: 50%; background: #ffc107; cursor: pointer; border: 3px solid #fff; box-shadow: 0 0 10px rgba(0,0,0,0.5);' +
                              '}' +
                              '</style>';
            
            $element.append(sliderStyle);
            $element.append(sliderHtml);

            var $slider = $("#timeline_slider_" + layout.qInfo.qId);
            
            $slider.on("mousedown touchstart", function(e) { 
                isDragging = true; 
                e.stopPropagation(); 
            });
            
            $slider.on("mouseup touchend", function(e) { 
                isDragging = false; 
                e.stopPropagation(); 
            });
            
            $slider.on("touchmove", function(e) {
                e.stopPropagation();
            });

            $slider.on("input", function(e) {
                var val = $(this).val(); 
                if (manGroup) {
                    var targetX = startX + (totalDistance * (val / 100));
                    manGroup.position.x = targetX;
                    updateManPosition(layout.qInfo.qId); 
                }
                e.stopPropagation();
            });
            
            window.THREE = THREE_Module;
            initScene(id, width, height, layout.qInfo.qId, gender, isMobile);

            return qlik.Promise.resolve();
        }
    };

    function showWarning($element, id, message, isMobile) {
        // Uyarı ekranında da aynı dinamik resim mantığını kullan
        var activeBg = isMobile ? bgMobile : bgDesktop;
        
        var bgStyle = "width:100%; height:100%; position:absolute; top:0; left:0; overflow:hidden;";
        bgStyle += "background-image: url('" + activeBg + "');";
        
        if (isMobile) {
            bgStyle += "background-size: cover; background-position: center bottom;";
        } else {
            bgStyle += "background-size: cover; background-position: center center;";
        }
        bgStyle += "background-repeat: no-repeat;";
        
        var overlayStyle = "position:absolute; top:0; left:0; width:100%; height:100%; " +
                           "background: rgba(0,0,0,0.6); " + 
                           "display: flex; flex-direction: column; justify-content: center; align-items: center; " +
                           "color: white; font-family: sans-serif; text-align: center; p-3";

        var html = '<div id="bg_' + id + '" style="' + bgStyle + '">' +
                   '<div style="' + overlayStyle + '">' +
                   '<div style="font-size: 40px; margin-bottom: 20px;">⚠️</div>' +
                   '<h2 style="margin:0; font-weight:300;">' + message + '</h2>' +
                   '<p style="opacity:0.8; margin-top:10px;">Görüntülemek için lütfen listeden bir kişi seçiniz.</p>' +
                   '</div></div>';
        
        $element.html(html);
    }

    function initScene(containerId, width, height, qId, gender, isMobile) {
        var container = document.getElementById(containerId);

        scene = new THREE.Scene();
        scene.background = null; 

        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        
        if (isMobile) {
            // Mobilde kamerayı geri çekiyoruz
            camera.position.set(0, 5, 22); 
        } else {
            camera.position.set(0, 4, 14); 
        }

        var ambientLight = new THREE.AmbientLight(0xffffff, 0.9); 
        scene.add(ambientLight);
        var dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        scene.add(dirLight);

        var floorGeo = new THREE.PlaneGeometry(200, 200);
        var floorMat = new THREE.ShadowMaterial({ opacity: 0.4 }); 
        var floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); 
        renderer.setSize(width, height);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        createProfessionalMan(gender); 
        createStairs(totalSteps);
        
        animate(qId);
    }

    function createProfessionalMan(gender) {
        manGroup = new THREE.Group();
        
        var isFemale = (gender === 'Kadın' || gender === 'Kadin' || gender === 'Female');
        
        var colors = isFemale ? {
            suit: 0x4a2c58, shirt: 0xffffff, skin: 0xf5cda4, shoes: 0x222222, hair: 0x2b1d14, case: 0x5d4037
        } : {
            suit: 0x2c3e50, shirt: 0xffffff, skin: 0xf5cda4, shoes: 0x1a1a1a, tie: 0xc0392b, hair: 0x2c2c2c, case: 0x5d4037
        };

        var mats = {
            suit: new THREE.MeshLambertMaterial({ color: colors.suit }),
            shirt: new THREE.MeshLambertMaterial({ color: colors.shirt }),
            skin: new THREE.MeshLambertMaterial({ color: colors.skin }),
            shoes: new THREE.MeshLambertMaterial({ color: colors.shoes }),
            hair: new THREE.MeshLambertMaterial({ color: colors.hair }),
            leather: new THREE.MeshLambertMaterial({ color: colors.case }),
            tie: isFemale ? null : new THREE.MeshLambertMaterial({ color: colors.tie })
        };

        var torsoWidth = isFemale ? 0.75 : 0.9; 
        var torso = new THREE.Mesh(new THREE.BoxGeometry(torsoWidth, 1.2, 0.45), mats.suit);
        torso.position.y = 2.6; torso.castShadow = true; manGroup.add(torso);
        
        var shirt = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.05), mats.shirt); shirt.position.set(0, 0.2, 0.21); torso.add(shirt);
        
        if (!isFemale) {
            var tie = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.06), mats.tie); 
            tie.position.set(0, 0.1, 0.22); torso.add(tie);
        }

        var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 16), mats.skin); neck.position.y = 0.7; torso.add(neck);
        var head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.55), mats.skin); head.position.y = 0.4; neck.add(head);
        
        if (isFemale) {
            var hairBaseGeo = new THREE.BoxGeometry(0.52, 0.3, 0.6);
            var hairBase = new THREE.Mesh(hairBaseGeo, mats.hair);
            hairBase.position.set(0, 0.25, 0.05); 
            head.add(hairBase);
            var bunGeo = new THREE.BoxGeometry(0.3, 0.6, 0.3);
            var bun = new THREE.Mesh(bunGeo, mats.hair);
            bun.position.set(0, 0.1, -0.4); 
            head.add(bun);
        } else {
            var hair = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.2, 0.57), mats.hair); 
            hair.position.y = 0.25; head.add(hair);
        }

        var armHeight = 0.7; var armGeo = new THREE.BoxGeometry(0.24, armHeight, 0.24); var forearmGeo = new THREE.BoxGeometry(0.2, armHeight, 0.2);
        var armPivotX = isFemale ? 0.5 : 0.57; 
        
        var rArmPivot = new THREE.Group(); rArmPivot.position.set(armPivotX, 0.5, 0); torso.add(rArmPivot); parts.rightArmPivot = rArmPivot;
        var rUpperArm = new THREE.Mesh(armGeo, mats.suit); rUpperArm.position.y = -armHeight / 2; rArmPivot.add(rUpperArm);
        var rElbowPivot = new THREE.Group(); rElbowPivot.position.set(0, -armHeight / 2, 0); rUpperArm.add(rElbowPivot); parts.rightElbowPivot = rElbowPivot;
        var rForearm = new THREE.Mesh(forearmGeo, mats.suit); rForearm.position.y = -armHeight / 2; rElbowPivot.add(rForearm);
        var rHand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), mats.skin); rHand.position.y = -armHeight / 2 - 0.075; rForearm.add(rHand);

        var lArmPivot = new THREE.Group(); lArmPivot.position.set(-armPivotX, 0.5, 0); torso.add(lArmPivot); parts.leftArmPivot = lArmPivot;
        var lUpperArm = new THREE.Mesh(armGeo, mats.suit); lUpperArm.position.y = -armHeight / 2; lArmPivot.add(lUpperArm);
        var lElbowPivot = new THREE.Group(); lElbowPivot.position.set(0, -armHeight / 2, 0); lUpperArm.add(lElbowPivot); parts.leftElbowPivot = lElbowPivot;
        var lForearm = new THREE.Mesh(forearmGeo, mats.suit); lForearm.position.y = -armHeight / 2; lElbowPivot.add(lForearm);
        var lHand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), mats.skin); lHand.position.y = -armHeight / 2 - 0.075; lForearm.add(lHand);
        var bc = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.8), mats.leather); bc.position.set(0, -0.3, 0); bc.rotation.z = 0.1; lHand.add(bc); parts.briefcase = bc;

        var legHeight = 0.8; var legWidth = isFemale ? 0.26 : 0.32; var shinWidth = isFemale ? 0.22 : 0.28; var legPivotX = isFemale ? 0.2 : 0.25;
        var thighGeo = new THREE.BoxGeometry(legWidth, legHeight, legWidth); var shinGeo = new THREE.BoxGeometry(shinWidth, legHeight, shinWidth);
        var shoeGeo = isFemale ? new THREE.BoxGeometry(0.24, 0.15, 0.4) : new THREE.BoxGeometry(0.3, 0.2, 0.5);

        var rLegPivot = new THREE.Group(); rLegPivot.position.set(legPivotX, -0.6, 0); torso.add(rLegPivot); parts.rightLegPivot = rLegPivot;
        var rThigh = new THREE.Mesh(thighGeo, mats.suit); rThigh.position.y = -legHeight / 2; rLegPivot.add(rThigh);
        var rKneePivot = new THREE.Group(); rKneePivot.position.set(0, -legHeight / 2, 0); rThigh.add(rKneePivot); parts.rightKneePivot = rKneePivot;
        var rShin = new THREE.Mesh(shinGeo, mats.suit); rShin.position.y = -legHeight / 2; rKneePivot.add(rShin);
        var rShoe = new THREE.Mesh(shoeGeo, mats.shoes); rShoe.position.set(0, -legHeight / 2 - (isFemale?0.075:0.1), 0.1); rShin.add(rShoe);
        if(isFemale){ var heel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mats.shoes); heel.position.set(0, -0.1, -0.1); rShoe.add(heel); }

        var lLegPivot = new THREE.Group(); lLegPivot.position.set(-legPivotX, -0.6, 0); torso.add(lLegPivot); parts.leftLegPivot = lLegPivot;
        var lThigh = new THREE.Mesh(thighGeo, mats.suit); lThigh.position.y = -legHeight / 2; lLegPivot.add(lThigh);
        var lKneePivot = new THREE.Group(); lKneePivot.position.set(0, -legHeight / 2, 0); lThigh.add(lKneePivot); parts.leftKneePivot = lKneePivot;
        var lShin = new THREE.Mesh(shinGeo, mats.suit); lShin.position.y = -legHeight / 2; lKneePivot.add(lShin);
        var lShoe = new THREE.Mesh(shoeGeo, mats.shoes); lShoe.position.set(0, -legHeight / 2 - (isFemale?0.075:0.1), 0.1); lShin.add(lShoe);
        if(isFemale){ var heel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mats.shoes); heel.position.set(0, -0.1, -0.1); lShoe.add(heel); }

        scene.add(manGroup);
        manGroup.position.set(startX, 0, 0);
        manGroup.rotation.y = Math.PI / 2;
    }

    function createStairs(count) {
        stairGroup = new THREE.Group();
        var stepMat = new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.7, transparent: true, opacity: 0.9 });
        for (var i = 0; i < count; i++) {
            var h = (i + 1) * stepHeight;
            var xPos = startX + 2 + (i * stepWidth); 
            var stepGeo = new THREE.BoxGeometry(stepWidth, h, 2);
            var step = new THREE.Mesh(stepGeo, stepMat);
            step.position.set(xPos + (stepWidth/2), h / 2, 0); 
            step.castShadow = true; step.receiveShadow = true;
            stairGroup.add(step);
        }
        scene.add(stairGroup);
    }

    function updateManPosition(qId) {
        var relativeX = manGroup.position.x - (startX + 2);
        var targetY = 0;
        var currentStepIndex = -1;
        
        if (relativeX > 0) {
            currentStepIndex = Math.floor(relativeX / stepWidth);
            if(currentStepIndex >= 0 && currentStepIndex < totalSteps) {
                var progressInStep = (relativeX % stepWidth) / stepWidth;
                var currentStepBaseY = currentStepIndex * stepHeight;
                if(progressInStep < 0.2) { 
                    var liftProgress = progressInStep / 0.2;
                    targetY = currentStepBaseY + (stepHeight * liftProgress);
                } else { 
                    targetY = (currentStepIndex + 1) * stepHeight;
                }
            } else if (currentStepIndex >= totalSteps) {
                 targetY = totalSteps * stepHeight;
                 currentStepIndex = totalSteps - 1;
            }
        } else {
            currentStepIndex = 0;
        }

        if(isDragging) {
            manGroup.position.y = targetY; 
        } else {
            manGroup.position.y += (targetY - manGroup.position.y) * 0.1;
        }

        if (currentStepIndex >= 0 && currentStepIndex < stepData.length) {
            var data = stepData[currentStepIndex];
            var $card = $("#dynamic_card_" + qId);
            if ($card.find("#card_date").text() !== "📅 " + data.date) {
                $card.find("#card_date").text("📅 " + data.date);
                $card.find("#card_info1").text(data.info1); 
                $card.find("#card_info2").text(data.info2); 
                $card.find("#card_info3").text(data.info3); 
                $card.css("transform", "scale(1.05)");
                setTimeout(function(){ $card.css("transform", "scale(1)"); }, 300);
            }
        }

        if (!isDragging && manGroup.position.x < (startX + 2 + ((totalSteps - 1) * stepWidth) + (stepWidth/2))) {
             var time = clock.getElapsedTime();
             var legSpeed = time * walkSpeed * 3;
             
             parts.rightLegPivot.rotation.x = Math.sin(legSpeed) * 0.8;
             parts.leftLegPivot.rotation.x = Math.sin(legSpeed + Math.PI) * 0.8;
             if(parts.rightKneePivot) parts.rightKneePivot.rotation.x = Math.max(0, Math.sin(legSpeed + Math.PI/2) * 1.2);
             if(parts.leftKneePivot) parts.leftKneePivot.rotation.x = Math.max(0, Math.sin(legSpeed - Math.PI/2) * 1.2);
             
             parts.rightArmPivot.rotation.x = Math.sin(legSpeed + Math.PI) * 0.6;
             parts.leftArmPivot.rotation.x = Math.sin(legSpeed) * 0.6;
             if(parts.rightElbowPivot) parts.rightElbowPivot.rotation.x = -0.2 + Math.abs(Math.sin(legSpeed)) * 0.2;
             if(parts.leftElbowPivot) parts.leftElbowPivot.rotation.x = -0.2 + Math.abs(Math.sin(legSpeed)) * 0.2;
             
             parts.briefcase.rotation.x = Math.sin(legSpeed) * 0.2;
             manGroup.rotation.z = 0.15; 
        } else {
             parts.rightLegPivot.rotation.x = 0; parts.leftLegPivot.rotation.x = 0;
             if(parts.rightKneePivot) parts.rightKneePivot.rotation.x = 0;
             if(parts.leftKneePivot) parts.leftKneePivot.rotation.x = 0;
             parts.rightArmPivot.rotation.x = 0; parts.leftArmPivot.rotation.x = 0;
             if(parts.rightElbowPivot) parts.rightElbowPivot.rotation.x = -0.1;
             if(parts.leftElbowPivot) parts.leftElbowPivot.rotation.x = -0.1;
             parts.briefcase.rotation.x = 0; manGroup.rotation.z = 0; 
        }

        var targetCamX = manGroup.position.x + 4; 
        var targetCamY = manGroup.position.y + 4;
        
        if(isDragging) {
            camera.position.x = targetCamX;
            camera.position.y = targetCamY;
        } else {
            camera.position.x += (targetCamX - camera.position.x) * 0.05;
            camera.position.y += (targetCamY - camera.position.y) * 0.05;
        }
        camera.lookAt(manGroup.position.x, manGroup.position.y + 1.5, 0);
    }

    function animate(qId) {
        animationId = requestAnimationFrame(function() { animate(qId); });
        
        if (manGroup) {
            var finalX = startX + 2 + ((totalSteps - 1) * stepWidth) + (stepWidth/2);

            if (!isDragging) {
                if (manGroup.position.x < finalX) {
                    manGroup.position.x += 0.03 * walkSpeed;
                    
                    var progress = ((manGroup.position.x - startX) / totalDistance) * 100;
                    $("#timeline_slider_" + qId).val(progress);
                    
                    updateManPosition(qId);
                } else {
                    $("#timeline_slider_" + qId).val(100);
                    updateManPosition(qId);
                }
            }
        }

        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }
});