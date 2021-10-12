var iMap = (function() {

    var MIN_DATE = '2014-01-01'
    var MAX_DATE = '2020-12-31'
    var adresseAPI = 'https://api-adresse.data.gouv.fr/search/?q=';
    var layer = L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',{
			  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>'
			});

    var map;
    var features;
    var layers; 
    var departements; 
    var departementLayer;    
    var communes;
    var communeLayer;
    var communesMappingPromise;
    var currentcommune;
    var sections;
    var sectionLayer;
    var parcelleLayer;    
    var hiddenCommunes=[];
    var hiddenSections=[];
    var hiddenDepartements=[];

    var startDate = MIN_DATE
    var endDate = MAX_DATE

    var data_section;
    var data_mutation=[];
    var prix_m=[];
    var alllayers=[];

    var myStyle = { fillOpacity: 0, color: "#000000", weight: 2, opacity: 0.65 };
    var overStyle = { color: "#000000", fillColor: "#92B4F4", fillOpacity: 0.35, weight: 4, opacity: 0.65 };
    var mutationStyle = { fillOpacity: 0.50, weight: 2, color: "#000000", fillColor: "#885053" };
    
    function highlightDepartement(e) {
        var layer = e.target;
        overStyle.fillColor="#92B4F4";
        layer.setStyle(overStyle);

        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            layer.bringToFront();
        }
    }

    function resetDepartement(e) {
        departementLayer.resetStyle(e.target);
    }

    function entrerDansDepartement(sonCode) {
        /*if (hiddenDepartements.length>0) {
            resetDepartement(hiddenDepartements[0].pop());
        }
    
        // Vide l'interface
        codeDepartement = sonCode;
        console.log('Nous entrons dans le département ' + codeDepartement);*/
        // Charge les communes
        return getCommunes(sonCode).then(afficherCommunesDepartement);
    }

    function entrerDansCommune(comCode) {
        return getSections(comCode).then(afficherSections);
    }

    function getCommunes(codeDepartement) {
        hiddenDepartements.push(alllayers[codeDepartement]);
        departementLayer.removeLayer(alllayers[codeDepartement]);
        return $.getJSON(`https://geo.api.gouv.fr/departements/${codeDepartement}/communes?geometry=contour&format=geojson&type=commune-actuelle`).then(function (communes) {
    
            // Pour Paris, Lyon, Marseille, il faut compléter avec les arrondissements
            if (['75', '69', '13'].includes(codeDepartement)) {
                return $.getJSON('/donneesgeo/arrondissements_municipaux-20180711.json').then(function (arrondissements) {
                    var features = communes.features.filter(function (e) {
                        return !(['13055', '69123', '75056'].includes(e.properties.code))
                    })
                    arrondissements.features.forEach(function (arrondissement) {
                        if (arrondissement.properties.code.startsWith(codeDepartement)) {
                            features.push(arrondissement)
                        }
                    })
                    return {type: 'FeatureCollection', features: features}
                })
            }
    
            return {type: 'FeatureCollection', features: communes.features}
        })
    }

    function getCadastreLayer(layerName, codeCommune) {
        return communesMappingPromise.then(function (communesMapping) {
            var communesToGet = codeCommune in communesMapping ? communesMapping[codeCommune] : [codeCommune]
            return Promise.all(communesToGet.map(function (communeToGet) {
                return getRemoteJSON(`https://cadastre.data.gouv.fr/bundler/cadastre-etalab/communes/${communeToGet}/geojson/${layerName}`)
            })).then(function (featureCollections) {
                return {
                    type: 'FeatureCollection',
                    features: featureCollections.reduce(function (acc, featureCollection) {
                        if (featureCollection && featureCollection.features) {
                            return acc.concat(featureCollection.features)
                        }
    
                        return acc
                    }, [])
                }
            })
        })
    }

    function getParcelles(codeCommune, idSection) {
        //console.log(idSection);
        return getCadastreLayer('parcelles', codeCommune).then(function (featureCollection) {
            return {
                type: 'FeatureCollection',
                features: _.chain(featureCollection.features)
                    .filter(function (f) {
                        return f.id.startsWith(idSection)
                    })
                    .sortBy('id')
                    .value()
            }
        })
    }

    function getMutations(codeCommune, idSection, startDate, endDate) {
        //console.log(section);
        return getRemoteJSON(`/api/mutations3/${codeCommune}/${idSectionToCode(idSection)}`)
            .then(function (data) {
                return data.mutations.filter(function (m) {
                    return m.date_mutation >= startDate && m.date_mutation <= endDate && m.id_parcelle.startsWith(idSection)
                })
            })
    }

    function getSections(codeCommune) {
        hiddenCommunes.push(alllayers[codeCommune]);
        communeLayer.removeLayer(alllayers[codeCommune]);
        return getCadastreLayer('sections', codeCommune).then(function (featureCollection) {
            var features = featureCollection.features
            var hasMultiplePrefixes = features.some(function (f) {
                return f.properties.commune !== codeCommune || f.properties.prefixe !== '000'
            })
            features.forEach(function (f) {
                if (!hasMultiplePrefixes) {
                    f.properties.label = f.properties.code
                    return
                }
    
                var labelPrefix = f.properties.commune === codeCommune ? f.properties.prefixe : f.properties.commune.substr(2)
                f.properties.label = `${labelPrefix} ${f.properties.code}`
            })
            return {type: 'FeatureCollection', features: features}
        })
    }

    function afficherCommunesDepartement(data){
        communes=data;
        if(communeLayer) map.removeLayer( communeLayer );
        if(sectionLayer) map.removeLayer( sectionLayer );
        if(parcelleLayer) map.removeLayer( parcelleLayer );
        communeLayer = L.geoJSON([],{
            style: myStyle,
            onEachFeature: function(feature, layer){
                feature.id=feature.properties.code;
                alllayers[feature.id]=layer;
                layer.on({
                    mouseover: highlightCommune,
                    mouseout: resetCommune,
                    click: enterCommune
                });
            }
        }).addTo(map);
        communeLayer.addData(communes);
            
        map.fitBounds(communeLayer.getBounds());
        /*hiddenDepartements.push(e.target.feature);
        map.removeLayer(e.target);*/
    }

    function enterDepartement(e) {
        //console.log(e.target.feature);
               
        var codedept=e.target.feature.properties.code;
        while (current = hiddenDepartements.pop()){ departementLayer.addData(current); }
        hiddenCommunes=[];hiddenSections=[];
        getCommunes(codedept).then(afficherCommunesDepartement);
        
    } 
    
    function highlightCommune(e) {
        var layer = e.target;
        overStyle.fillColor="#BDCFB5";
        layer.setStyle(overStyle);

        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            layer.bringToFront();
        }
    }

    function resetCommune(e) {
        communeLayer.resetStyle(e.target);
    }

    function afficherSections(data){
        sections=data;
        if(sectionLayer) map.removeLayer( sectionLayer );
        if(parcelleLayer) map.removeLayer( parcelleLayer );
        sectionLayer = L.geoJSON([],{
            style: myStyle,
            onEachFeature: function(feature, layer){
                alllayers[feature.id]=layer;
                layer.on({
                    mouseover: highlightSection,
                    mouseout: resetSection,
                    click: enterSection
                });
            }
        }).addTo(map);
        sectionLayer.addData(sections);
            
        map.fitBounds(sectionLayer.getBounds());
        /*hiddenCommunes.push(e.target.feature);
        map.removeLayer(e.target);*/
    }

    function enterCommune(e) {
        //console.log(e.target.feature);
        currentcommune=e.target;
        //while (current = hiddenCommunes.pop()){ communeLayer.addData(current); }
        //hiddenSections=[];
        getSections(e.target.feature.properties.code).then(afficherSections);
    } 

    function highlightSection(e) {
        var layer = e.target;
        overStyle.fillColor="#70B77E";
        layer.setStyle(overStyle);

        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            layer.bringToFront();
        }
    }

    function resetSection(e) {
        sectionLayer.resetStyle(e.target);
    }

    function highlightMutation(e) {
        //console.log(e.target.options);
        var layer = e.target;
        overStyle.fillColor=e.target.options.fillColor;
        layer.setStyle(overStyle);

        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            layer.bringToFront();
        }
    }

    function resetMutation(e) {
        mutationStyle.fillColor=e.target.options.fillColor;
        e.target.setStyle(mutationStyle);
    }

    function enterMutation(e){
        
        //console.log(_.meanBy(prix_m[e.target.feature.id], (m) => m.prixm),data_mutation[e.target.feature.id]);
        prixm2=_(prix_m[e.target.feature.id])
                            .groupBy('mutation_id')
                            .map((prixm) => ({ valeur: _.meanBy(prixm,function(o) { return Number(o.prixm); }) }))
                            .value();
        console.log(prixm2[0].valeur,prix_m[e.target.feature.id]);

    }

    function getColor(d) {
        return !isFinite(d) ? '#9332a8' :
               d > 5000 ? '#dd776e' :
               d > 4500 ? '#e2886c' :
               d > 4000 ? '#e79a69' :
               d > 3500 ? '#ecac67' :
               d > 3000 ? '#e9b861' :
               d > 2500 ? '#f5ce62' :
               d > 2000 ? '#d4c86a' :
               d > 1500 ? '#b0be6e' :
               d > 1000 ? '#94bd77' :
               d > 500  ? '#73b87e' :
                          '#57bb8a';
    }

    function entrerDansSection(){
        // Une fois qu'on a la géographie et les mutations, on fait tout l'affichage
        
            var parcellesId = data_section.map(function (parcelle) {
                return parcelle.id_parcelle
            });
            parcellesId.unshift('id');
            parcellesId=_.uniq(parcellesId);
            _.forEach(parcellesId, function(value) {prix_m[value]=[];});  
            _.forEach(data_section, function(value,key) {data_mutation[value.id_mutation]=[];});
            _.forEach(data_section, function(value,key) {
                data_mutation[value.id_mutation].push(value);
            });
                
            _.forEach(data_section, function(value,key) {
                /*test=_(data_mutation[value.id_mutation]).map((prixm,cle) => ({ valeur: _.meanBy(prixm,function(o) { return Number(o.valeur_fonciere); }),surface: _.sumBy(prixm, function(o) { return Number(o.surface_reelle_bati); }), }))
                .value();
                */
               //console.log(_.meanBy(data_mutation[value.id_mutation],function(o) { return Number(o.valeur_fonciere); }),_.sumBy(data_mutation[value.id_mutation],function(o) { return Number(o.surface_reelle_bati); }));
               vf=_.meanBy(data_mutation[value.id_mutation],function(o) { return Number(o.valeur_fonciere); });
               su=_.sumBy(data_mutation[value.id_mutation],function(o) { return Number(o.surface_reelle_bati); });
               if(su==0){
                   su=_.sumBy(data_mutation[value.id_mutation],function(o) { return Number(o.surface_terrain); });
               }
               if(isFinite(vf/su)){
                value.prixm=vf/su;
                prix_m[value.id_parcelle].push(value);
               }
                
            });    
            //console.log(data_mutation);
            parcelleLayer = L.geoJSON([],{
                style: myStyle,
                onEachFeature: function(feature, layer){
                    //console.log(feature);
                    if(_.includes(parcellesId, feature.id)){
                        //calcul de la moyenne par rapport au prixm² groupé par mutation
                        prixm2=_(prix_m[feature.id])
                        .groupBy('mutation_id')
                        .map((prixm) => ({ valeur: _.meanBy(prixm,function(o) { return Number(o.prixm); }) }))
                        .value();
                        //console.log(prixm2,);
                        if(prixm2.length==0){
                            color='#9332a8';
                        }else{
                            color=getColor(prixm2[0].valeur);
                        }
                        mutationStyle.fillColor=color;
                        layer.setStyle(mutationStyle);
                        layer.on({
                            mouseover: highlightMutation,
                            mouseout: resetMutation,
                            click: enterMutation
                        });
                    }
                }                    
            }).addTo(map);
            parcelleLayer.addData(parcelles);
            map.fitBounds(parcelleLayer.getBounds());
            parcelleLayer.bringToFront();
            
            //hiddenSections.push(e.target.feature);
            //map.removeLayer(e.target);
        
    }

    function enterSection(e) {
        //console.log(e.target.feature.properties);
        //e.target.setStyle({ fill: false });
        hiddenSections.push(alllayers[e.target.feature.id]);
        sectionLayer.removeLayer(alllayers[e.target.feature.id]);
        return Promise.all([
            // Charge la couche géographique
            getParcelles(currentcommune.feature.properties.code, e.target.feature.properties.id).then(function (data) {
                parcelles = data;
            }),
            // Charge les mutations
            getMutations(currentcommune.feature.properties.code, e.target.feature.properties.id, startDate, endDate).then(function (data) {
                data_section = data
            })
        ]).then(entrerDansSection);
    }    
    
    function getRemoteJSON(url, throwIfNotFound) {
        return fetch(url).then(function (response) {
            if (response.ok) { return response.json()}    
            if (response.status === 404 && !throwIfNotFound) { return }    
            throw new Error('Impossible de récupérer les données demandées : ' + response.status)
        })
    }

    function idSectionToCode(idSection) {
        return idSection.substr(5, 5)
    }

    function autocompleteAdresse(){
        var inputValue = document.getElementById("rechercheadresse").value;
        if (inputValue) {
            fetch(adresseAPI+inputValue)
                .then(function (response) {
                    response.json().then(function (data) {
                        responseAdresse(data);
                    });
                });
        } else {
            document.getElementById("selectionadresse").style.display = "none";
        }
    }

    function responseAdresse(response) {
        select = document.getElementById("selectionadresse");
        if (Object.keys(response.features).length > 0) {
            
            select.style.display = "block";
            select.innerHTML="";
            var ul = document.createElement('ul');
            select.appendChild(ul);
            response.features.forEach(function (element) {
                var li = document.createElement('li');
                var ligneAdresse = document.createElement('span');
                var infosAdresse = document.createTextNode(element.properties.postcode + ' ' + element.properties.city);
                ligneAdresse.innerHTML = element.properties.name;
                li.onclick = function () { /*selectAdresse(element);*/getSectionFromAdresse(element) };
                li.appendChild(ligneAdresse);
                li.appendChild(infosAdresse);
                ul.appendChild(li);
            });
        } else {
            select.style.display = "none";
        }
    }

    function getSectionFromAdresse(element){
        query = encodeURIComponent(JSON.stringify(element.geometry));
        return getRemoteJSON(`https://apicarto.ign.fr/api/cadastre/division?geom=${query}`)
        .then(function (data) {
            //console.log(data.features[0].properties);
            document.getElementById("selectionadresse").style.display='none';
            var props=data.features[0].properties;
            var section = props.section.padStart(5, '0');
			var code_dep = props.code_dep;
			var code_com = props.code_com;
            entrerDansDepartement(code_dep).then(function(){
				entrerDansCommune(code_dep+code_com).then(function(){
                    currentcommune=alllayers[code_dep+code_com];
                    hiddenSections.push(alllayers[code_dep+code_com+section]);
                    sectionLayer.removeLayer(alllayers[code_dep+code_com+section]);
					return Promise.all([
                        // Charge la couche géographique
                        getParcelles(code_dep+code_com, code_dep+code_com+section).then(function (data) {
                            parcelles = data;
                        }),
                        // Charge les mutations
                        getMutations(code_dep+code_com, code_dep+code_com+section, startDate, endDate).then(function (data) {
                            data_section = data
                        })
                    ]).then(entrerDansSection);
                    
                });
            });
        });
    }
   // Public API
   return {
    map: map,
    features: features,
    layers: layers,
    getMap: function(){
      return map;
    },
    init: function(){
        
        map = L.map('map', {
                        /*crs: crs,*/
            attributionControl: false,
                        minZoom: 6,//minZoom: 10
                        messagebox: false
        });

        layer.addTo(map);
        
        map.setView(L.latLng(47, 3),5);

        // Chargement des contours des départements
        $.getJSON("/donneesgeo/departements-100m.geojson",
            function (data) {
                departements = data
            }
        ).then(function() {
            
            departementLayer = L.geoJSON([],{
                style: myStyle,
                onEachFeature: function(feature, layer){
                    feature.id=feature.properties.code;
                    alllayers[feature.id]=layer;
                    layer.on({
                        mouseover: highlightDepartement,
                        mouseout: resetDepartement,
                        click: enterDepartement
                    });
                }
            }).addTo(map);
            departementLayer.addData(departements);
        });
        communesMappingPromise = getRemoteJSON('/donneesgeo/communes-mapping.json', true);   
                    //map.on('overlayadd', loadLayer);
        
        document.getElementById('rechercheadresse').addEventListener("input", _.debounce(autocompleteAdresse,500), false);            
    }
};

})();

$(document).ready(function() {
//$.cookie.json = true;
iMap.init();

});   