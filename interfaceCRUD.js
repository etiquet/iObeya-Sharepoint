/**
 * Opérations CRUD iObeya
 */

/*** Création d'une liste de noeuds sur le board ***/
function createiObeyaNode(elements, afterCommit) {
	var jsonNote, x;
	try {
		jsonNote = JSON.stringify(elements);
		console.log("Create nodes");
		x = postJSONData(IOBEYAURL + "/s/j/elements", jsonNote);
		x.onload = function(){
			 // on récupère l'id de la note mise à jours dans l'array (peut contenir des overlappings éléments)
			var idNoteiObeya = null, i;
			for (i = 0; i < elements.length; i += 1) {
				if (elements[i]['@class'] === "com.iobeya.dto.BoardNoteDTO") {
					idNoteiObeya = elements[i].id;
				}
			}
			commitiObeyaChanges(afterCommit, idNoteiObeya);
			nextRequest();
		};

		startQueue();
		return true;
	} catch (e) {
		throw e;
	}
}

/*** Mise à jour d'une liste de noeuds sur le board ***/
function updateiObeyaNode(elements, afterCommit) {
	var jsonNote, x;
	try {
		console.log("Update nodes");
		jsonNote = JSON.stringify(elements);

		x = postJSONData(IOBEYAURL + "/s/j/elements", jsonNote);
		x.onload = function() {
			// on récupère l'id de la note mise à jours dans l'array (peut contenir des overlappings éléments)
			var idNoteiObeya = null, i;
			for (i = 0; i < elements.length; i += 1) {
				if (elements[i]['@class'] === "com.iobeya.dto.BoardNoteDTO") {
					idNoteiObeya = elements[i].id;
				}
			}
			commitiObeyaChanges(afterCommit, idNoteiObeya);
			nextRequest();
		};
		startQueue();

		return true;
	} catch (e) {
		throw e;
	}
}

/*** Suppression d'éléments du board ***/
function removeiObeyaElement(idElt, afterCommit) {
	var elements, jsonNote, x;
	try {
		elements = [idElt];
		jsonNote = JSON.stringify(elements);
		console.log("Delete elements : " + elements);
		x = postJSONData(IOBEYAURL + "/s/j/elements/delete", jsonNote);
		x.onload = function() {
			commitiObeyaChanges(afterCommit,idElt);
			nextRequest();
		};
		startQueue();

		return true;
	} catch(e) {
		throw e;
	}
}


/*** Création d'une liste de noeuds dans la corbeille ***/
//TODO à tester

function createiObeyaNodeInTrash(iObeyaNodes,iObeyaObjid, afterCommit) {
	try {
		if (iObeyaObjid.length == 0 ) // pas d'élément à mettre à la corbeille
				return;


		console.log("Corbeille :");
		console.log(iObeyaObjid);

		var x, i,elements,jsonNote;

		elements = getBoardSharedElements(iObeyaNodes,iObeyaObjid); // on créer un objet partagé pour pouvoir mettre l'object à la poubelle
		jsonNote = JSON.stringify(elements); // on teste avec un seul objet...

		x= postJSONData(IOBEYAURL + "/s/j/boardShared", jsonNote);
		x.onload = function() {
				commitiObeyaChanges(afterCommit,iObeyaObjid); // on peut envoyer un array ( la note est en [0])
				nextRequest();
			}
		startQueue();

		return true;
	} catch (e) {
		throw e;
	}
}

/*** Récupération de l'objet BoardSharedElement pour mise en corbeille ***/
//TODO:A tester.

function getBoardSharedElements(iObeyaNodes,iObeyaObjid) {
	var sharedElt={};

		sharedElt['@class'] = "com.iobeya.dto.BoardSharedElementDTO";
		sharedElt.container = {
			"@class": "com.iobeya.dto.EntityReferenceDTO",
			"id": getiObeyaObjectById(iObeyaNodes,iObeyaObjid[0]).boardid, // on prend la valeur du premier objet
			"type": "com.iobeya.dto.BoardDTO"
			};
		sharedElt.kind = "trashBox";
		sharedElt.ids = [];

		for (var i in iObeyaObjid){ // on créer un array d'objet
			sharedElt.ids.push(iObeyaObjid[i]); // une liste object IDs
		}

	return [sharedElt];
}

/*** Commit des changements iObeya ***/
/* iObeya ne prend en compte les changements demandés qu'après l'appel de cette fonction
	aftercommit est une fonction qui doit être executée après l'appel de cette fonction
	idNoteiObeya : permet de garde en "tête" la note qui est modifiée par cet appel. (ex: pour reporter une erreur dans la ligne du RIDA)

	cf page 39 Developper guide 3.4 : Commit Changes : When a client makes some changes in the room, changes are not propagated automatically to other clients. He must explicitly inform the server of the changes by calling the MeetingService#commitRoom method.

	retour du Webservice : "@class": "com.iobeya.web.JSonResult", "result": "success","messages": []

*/

function commitiObeyaChanges(afterCommit, idNoteiObeya) {
	var xhttpr=[]; // tableau d'object Jscript

	try {

		// On boucle ici sur l'ensemble des boards. (le commit nécessite une Room et un Board)
		for (i in g_iO_boards){

        	xhttpr[i] = getJSONData(IOBEYAURL + "/s/j/meeting/commit/" + iO_clientId
									+ "?roomId=" 	+ g_iO_activeRoom.id
									+ "&boardId=" + g_iO_boards[i].id
								   ); // requête jsonhttp Async

			xhttpr[i].onload = function() { // fonction Asynchrone appelée sur la fin de l'appel http.
					var jsonResponse = JSON.parse(this.responseText);
					console.log(jsonResponse);

					if (jsonResponse.result == "error" && idNoteiObeya != null) {

						/*var idiObeya=idNoteiObeya;

						if (Array.isArray(idNoteiObeya)) // c'est un array, on prend uniquement le premier élément
							idiObeya=idNoteiObeya[0]; */

						// En cas d'erreur du commit, on indique que la synchronisation a échoué et met à jour le status de la synchro dans le RIDA.
						var ridaObject = getRidaObjectByiObeyaId(ridaNodes, /*idiObeya*/idNoteiObeya);
						if (ridaObject != null) {

							console.log("Erreur de synchronisation de la tâche RIDA " + ridaObject.idRida);
							updateRidaStatusSync(ridaObject.idRida, parseStatus(status_failed)); // on met à jours
							g_syncErrors++;
						}
					}

				// on appelle la fonction post commit si demandée
				// typiquement cette fonction est appelée par syncActors_refresh(iObeyaNodes) {
				// pour créer un label dans le roll des ressources.

					if (afterCommit != null) {
						afterCommit();
						}

					nextRequest(); // la fonction de completion est Asynchrone => on s'assure de lancer le traitement de la requête suivante.
				}
		}// boucle sur les tableaux

		// On déclenche la queue d'appel asynchrone pour réaliser le commit
		startQueue();

	}
	catch(e) {
		displayException(e);
	}
}

/**
 * Opérations CRUD RIDA
 */

/*** Création d'une donnée RIDA ***/
function createRida(iObeyaNote, nodesiObeya) {

	try {
		var itemCreateInfo = new SP.ListItemCreationInformation();
		var oListItem = oList.addItem(itemCreateInfo);
		
		// Préparatifs communs à la mise à jour d'un élément RIDA
		oListItem = prepareOListItem(oListItem, iObeyaNote, nodesiObeya);
		// Date de création
		oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["creationDate"], new Date(iObeyaNote.creationDate));
		// On modifie la date de modification car sinon les notes vont être resynchronisées dans l'autre sens
		oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["modificationDate"], new Date(getNoteLastModificationDate(iObeyaNote, nodesiObeya)));

		// Synchronisé avec iObeya : Oui
		oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["synchroStatus"], synchro_status_done);

		oListItem.update();
		g_clientContext.load(oListItem);
    
    	console.log("Create RIDA " + iObeyaNote.id);
	    return true;
	}
	catch (e) {
		throw e;
	}
}

/*** Mise à jour d'une donnée RIDA ***/
function updateRida(ridaId, iObeyaNote, nodesiObeya) {

	try {
	    var oListItem = oList.getItemById(ridaId);
	    
		// Préparatifs communs à la création d'un élément RIDA
		oListItem = prepareOListItem(oListItem, iObeyaNote, nodesiObeya);

		oListItem.update();
		console.log("Update RIDA sur l'id iObeya :" + iObeyaNote.id);
		return true;
	}
	catch (e) {
		throw e;
	}
}

/*** Étapes communes à la création et mise à jour d'un élément RIDA à partir d'iObeya */
function prepareOListItem(oListItem, iObeyaNote, nodesiObeya) {

	    // Récupérer les objets qui chevauchent le post-it
	    var iObeyaOverlapping = findOverlappingElements(iObeyaNote, nodesiObeya);
		var iObeyaLabel = getAssociatedLabel(iObeyaOverlapping);
		var iObeyaPercentCompleteSticker = getAssociatedPercentCompleteSticker(iObeyaOverlapping);
		var iObeyaPrioritySticker = getAssociatedPrioritySticker(iObeyaOverlapping);
	var iObeyaEscallationSticker = getAssociatedEscallationSticker(iObeyaOverlapping);

	    // Extraire les champs de l'objet note puis des étiquettes et stickers associés à des données RIDA
	    oListItem = getNoteProperties(oListItem, iObeyaNote, nodesiObeya);
	    oListItem = getLabelProperties(oListItem, iObeyaLabel);
	    oListItem = getPercentCompleteStickerProperties(oListItem, iObeyaPercentCompleteSticker);
	    oListItem = getPriorityStickerProperties(oListItem, iObeyaPrioritySticker);
	oListItem = getEscallationStickerProperties(oListItem, iObeyaEscallationSticker, nodesiObeya);

	    // Date de modification
		oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["modificationDate"], new Date(getNoteLastModificationDate(iObeyaNote, nodesiObeya)));
	// Nom du tableau sur lequel est la note
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["PanneauiObeya"], iObeyaNote.boardname);

	    
	return oListItem;
}

/*** Étapes communes à la création et mise à jour d'un élément RIDA à partir d'iObeya */
function prepareOListItem(oListItem, iObeyaNote, nodesiObeya) {


/*** Mise à jour du statut de synchronisation d'une donnée RIDA ***/
function updateRidaStatusSync(ridaId, status) {

	try {
	    var oListItem = oList.getItemById(ridaId);
    	oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["synchroStatus"], status);
	    oListItem.update();
		return true;
	}
	catch(e) {
		throw e;
	}
}

/*** Désactive la synchronisation d'une donnée RIDA ***/
function leaveSynchroRida(ridaId) { console.log("ICI" + ridaId);
	try {
	    var oListItem = oList.getItemById(ridaId);
    	oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["synchroiObeya"], false);
    	oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["idiObeya"], null);
	    oListItem.update();

	    return true;
	}
	catch(e) {
		throw e;
	}
}

/* version pour iObeya 3.3 */
/*        note.props= {
            'content ' : contentLabel, // au milieu
            'title ' : label0, // en haut
            'responsible' : label1, // en bas à gauche
            'date' : label2, // en bas à droit
            'worload' : workload // non affiché
        };*/

// note : ancien prototype de la fonction ==> getNoteProperties(ridaId, nodesRida, oListItem, iObeyaNote, nodesiObeya);
// cette fonction récupère les données d'un object iObeya en mémoire ( récupéré depuis la plateforme )
// la fonction met également à jour les données de l'object nodesRida[idInRidaArray] (si non null), associée pour permettre de répliquer des régles associées aux données de charges
// notamment, cela permet de faire une post mise à jour de la note iObeya dans l'outil si le flag  suivant est positionné >> iObeyaNote.toreupdate = true

function getNoteProperties(oListItem, iObeyaNote, nodesiObeya) {
	var statusObject;
	var error = g_syncErrors;

	try { // On traite les données liées à la charge

		mapIObeyaToRida(iObeyaNote, oListItem);

		if (error !== g_syncErrors) { // il y a eu un pb d'interpretation
			// on ajoute /!\ au début de la note pour attirer l'attention
			iObeyaNote.props.content = "/!\\ " + iObeyaNote.props.content;
			iObeyaNote.toreupdate = true;
		}

		statusObject = findNoteStatus(iObeyaNote, nodesiObeya); // Statut
		oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["status"], statusObject.status);

		// Echéance ferme (la note est en rouge)
		if (iObeyaNote.color === NOTE_WARNING_COLOR) {
			oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["firmDeadline"], true);
		}
		else {
			oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["firmDeadline"], false);
		}
		// ID iObeya
		oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["idiObeya"], iObeyaNote.id);
		// Synchronisé avec iObeya : Oui
		oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["synchroiObeya"], true);

		return oListItem;
	}
	catch (e) {
		throw e;
	}
}

/***
 * Met à jour l'objet RIDA en fonction du fragment de l'objet iObeya passé en paramètre.
 * Le fragment iObeya est aussi parfois modifié, en particulier si une erreur est rencontrée.
 * @param iObeyaNote Object I/O Partie de l'objet iObeya, mis à jour dans la fonction
 * @param oListItem Object I/O Objet Sharepoint, mis à jour dans la fonction
 */
function mapIObeyaToRida(iObeyaNote, oListItem) {

	for(var key in IOBEYANOTE_MAPPING) {
		var mappingItem = IOBEYANOTE_MAPPING[key];

		// Vérification de la présence des champs nécessaires
		if (!mappingItem.hasOwnProperty('type')) {
			//throw new InterfaceException("L'objet '"+key+"' de transformation de iObeya vers RIDA ne possède pas de champ \'type\'");
			console.info("L'objet '"+key+"' de transformation de iObeya vers RIDA ne possède pas de champ \'type\'. C'est peut-être normal.");
			continue;
		}
		if (!mappingItem.hasOwnProperty('rida_field')) {
			//throw new InterfaceException("L'objet '"+key+"' de transformation de iObeya vers RIDA ne possède pas de champ \'rida_field\'");
			console.info("L'objet '"+key+"' de transformation de iObeya vers RIDA ne possède pas de champ \'rida_field\'. C'est peut-être normal.");
			continue;
		}

		// Initialisation à partir du template iObeya
		// {'title': 'titre dans iobeya'}
		var iObeyaPartPtr = getiObeyaPropertyObject(iObeyaNote, key);
		var data = iObeyaPartPtr[key];
		var type = mappingItem.type;
		var rida_field = mappingItem.rida_field;

		// Si on doit mettre à jour l'objet iObeya (ex. en cas d'erreur)
		var updateIObeya = false;

		if(data){
			// En fonction du type de traitement voulu pour le champ de la note
			switch (type) {
				// Mapping simple, 1 -> 1
				case 'text':
					// on nettoit les caractères non alphanum
					data = data.replace(/(\t|\n|\r|\f)/g, "");
					
					 if(data.length>=255){
							data=data.substring(0,254);
						 	data=data.concat("…");
						alert("Le champ texte de la note dépasse 255 caractères, il a été tronqué :\n\n" + iObeyaNote.props.content);
					 }
					oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field], data);
					break;

				// Mapping complexe 1 -> *
				case 'concat':
					// Vérification du type, qu'on ait plusieurs champs à concaténer
					if (rida_field.constructor === Array) {
						// Définition de la chaine de séparation des champs
						var concatString = ":"; // Si pas définie, ':' par défaut
						if (mappingItem.hasOwnProperty('concatString'))
							concatString = mappingItem.concatString;

						data = data.split(concatString);

						rida_field.forEach(function (value, index) {
							// Protection contre le 'trop de split'
							if(rida_field[index+1]) {
								oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[value], data.shift().trim());
							} else {
								var reConcatenatedData = '';
								while(data.length > 1) { // Pas jusqu'au dernier élément, il est ajouté en dehors du 'while'
									reConcatenatedData += data.shift() + concatString;
								}
								reConcatenatedData += data.shift();
								if (reConcatenatedData==undefined )
									alert ( "data undefined Note : " + iObeyaNote.props.content )
								oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[value], reConcatenatedData);
							}
						});
					} else if (rida_field.constructor === String) {
						oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field], data);
					}
					break;

				// Mapping 1 + 'string' -> 1
				case 'numeric':
					// On récupère le marqueur (ex. ' J/H (RAF)')
					var unit = '';
					if (mappingItem.hasOwnProperty('unit'))
						unit = mappingItem.unit;

					var numbers = filterNumbers(data);
					if (numbers !== null) { // OK, car data initalisé à '' et filterNumbers('') = null
						// on place la valeur dans le RIDA
						oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field], numbers);
						// on met à jour l'objet iObeya en mémoire avec le texte au bout
						data = numbers + unit;
					} else {
						// Choisir : log | changement de val. iObeya | alert
						//console.error('Champ de type "numeric" définit sans nombre de jours');
						data = "/!\\ " + data; // Ajout de /!\ au champ pour alerter de l'erreur
						g_syncErrors++;
					}
					updateIObeya = true;
					break;

				case 'date':
					data = parseDate(data);
					if (data !== -1 && data.length) {
						var dateData  = new Date(reverseDate(data));
						oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field], dateData);
					} else {
						// erreur sur le format, on place le message d'erreur dans la note ( mettre une alerte sur la note ?)
						data = "/!\\ format attendu : jj/mm/aaaa";
						g_syncErrors++;
					}
					// On met à jour dans tous les cas, pour homogénéiser la façon dont est stockée la date
					updateIObeya = true;
					break;

				default:
					break;
			}
		}
		// S'il y a des données à faire remonter à l'utilistateur iObeya, à travers le pointeur
		// récupéré de l'objet iObeyaObj

		if (updateIObeya) {
			iObeyaNote.toreupdate = true; // force la mise à jour de la note après le traitement pour afficher la valeur retraitée
			iObeyaPartPtr[key] = data;
		}
	}
}

/*** Récupère les propriétés intrinsèques à l'étiquette "Acteur" pour la mise à jour RIDA ***/
// par defaut si le label ne correspond pas à un terme acteurs on position une chaine vide dans le rida / acteur

function getLabelProperties(ridaItem, iObeyaLabel) {
	var actorTermId = null, actorname = null, found = false;

	try {
		// on check si la liste des acteurs n'est pas vide... demande son avis à l'utilisateur / retry
		if (!verifieActorsList_sync())
			return ridaItem; // on ne traite pas sinon on risque de vider les acteurs

		// on vérifie (et détermine l'id du termes acteurs)

		if (iObeyaLabel != null) { // le iObeyaLabel n'est pas vide
			for (var i in g_actorsTermsList) { // on vérifie que cela correspond bien à un terme acteurs...

				if ((iObeyaLabel.contentLabel.length == 0 )) {
					console.log("Label content vide ");
					console.log("titre note : " + iObeyaLabel.notetitle);
					return ridaItem; // on s'arrête là
				}

				// (ancienne)option avec l'utilisation de la taxonomie, il faut traiter l'object taxonomie sharepoint
				if (g_actorsTermsList[i] instanceof SP.Taxonomy.Term) {
					if (g_actorsTermsList[i].get_name().toLocaleLowerCase() == iObeyaLabel.contentLabel.toLocaleLowerCase()) {
						actorTermId = g_actorsTermsList[i].get_id().toString(); // l'id du terme dans la taxonomie de sharepoint
						found=true;	
						// break;
					}
				}
				// nouvelle option avec l'utilisation d'une liste sharepoint (l'acteur est une colonne)
				if ((g_actorsTermsList[i] instanceof Object)) { // TODO FIX of error of content type

					if (iObeyaLabel.contentLabel instanceof Array)
						if (iObeyaLabel.contentLabel[0] instanceof SP.FieldLookupValue) // TODO: etre capable de gérer une multitudes d'acteurs
							iObeyaLabel.contentLabel = iObeyaLabel.contentLabel[0].get_lookupValue();

					if (g_actorsTermsList[i]["actor"].toLocaleLowerCase() == iObeyaLabel.contentLabel.toLocaleLowerCase()) {
						actorid = g_actorsTermsList[i]["ID"]; // l'id du terme dans la taxonomie de sharepoint
						found=true;
						// break;
					}
				}

				if (!found) { // Alert de l'utilisateur que le terme acteur ne sera pas positionné
					var breakpoint = true; // for debugging, not found

					alert("\nAttention : l'acteur *  "
						+ iObeyaLabel.contentLabel
						+ " * n'existe pas dans la banque de terme (taxonomie) des acteurs de Sharepoint."
						+ "\n\nLe champs 'acteur' de l'entrée dont le titre est : * "
						+ iObeyaLabel.notetitle + " * , ne peut être positionné dans le portail Sharepoint, il ne sera pas modifié. \n"
						+ "\nSi vous pensez que c'est une erreur (orthographe ?), demandez à votre administrateur d'ajouter l'acteur dans la banque de terme ou la liste sharepoint selon votre configuration.\n"
						+ "\nLa synchronisation courante va se poursuivre. \nNotez les éléments de ce message avant de valider.\nLa prochaine synchronisation RIDA > iObeya effacera l'acteur de la note."
					);
					g_syncErrors++; // on incrémente les erreur
					ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["actor"], null); // on vide l'acteur
					return ridaItem; // on s'arrête là
				} else {
					// si c'est un acteur issu de la taxonomie, il faut donner l'index du terms
					if (g_actorsTermsList[i] instanceof SP.Taxonomy.Term)
						ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["actor"], actorTermId);

				// si c'est un acteur issu d'une liste, on renvoie juste le texte
				if ( g_actorsTermsList[i] instanceof Object) 
					ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["actor"],actorid);
			} // else
		}
		else { // il est vide...
			ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["actor"], null);
		}

		return ridaItem;
	}
	catch (e) {
		throw e;
	}
	return ridaItem;
}

/*** Récupère les propriétés intrinsèques au sticker "% achevé" pour la mise à jour RIDA ***/
function getPercentCompleteStickerProperties(ridaItem, iObeyaPercentCompleteSticker) {
	try {
		if (iObeyaPercentCompleteSticker != null) {
			for (value in PERCENTAGE_IOBEYASTICKER_MAPPING.map) {
				if (PERCENTAGE_IOBEYASTICKER_MAPPING.map[value].id == iObeyaPercentCompleteSticker.stickerImage.id) {
					ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["percentComplete"], value);
				}
			}
		}
		else {
			ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["percentComplete"], null);
		}

		return ridaItem;
	}
	catch(e) {
		throw e;
	}
}

/*** Récupère les propriétés intrinsèques au sticker "Priorité" pour la mise à jour RIDA ***/
function getPriorityStickerProperties(ridaItem, iObeyaPrioritySticker) {
	try {
		if (iObeyaPrioritySticker != null) {
			for (value in PRIORITY_IOBEYASTICKER_MAPPING.map) {
				if (PRIORITY_IOBEYASTICKER_MAPPING.map[value].id == iObeyaPrioritySticker.stickerImage.id) {
					ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["priority"], value);
				}
			}
		}
		else {
			ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["priority"], null);
		}

		return ridaItem;
	}
	catch(e) {
		throw e;
	}
}