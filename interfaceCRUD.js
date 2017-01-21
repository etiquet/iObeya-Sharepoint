/**
 * Opérations CRUD iObeya
 */

/*** Création d'une liste de noeuds sur le board ***/
function createiObeyaNode(elements, afterCommit) {
	var jsonNote, x;
	try {
		jsonNote = JSON.stringify(elements);
		console.log("Create nodes");
		x = postJSONData(iObeyaURL + "/s/j/elements", jsonNote);
		x.onload = function(){
			var idNoteiObeya = null, i;
			for (i = 0; i < elements.length; i += 1) {
				if (elements[i]['@class'] === "com.iobeya.dto.BoardNoteDTO") { // TODO: on ne fait que des notes, pourquoi ?
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
		jsonNote = JSON.stringify(elements);
		console.log("Update nodes");
		x = postJSONData(iObeyaURL + "/s/j/elements", jsonNote);
		x.onload = function() {
			var idNoteiObeya = null, i;
			for (i = 0; i < elements.length; i += 1) {
				if (elements[i]['@class'] === "com.iobeya.dto.BoardNoteDTO") { // TODO: on ne fait que des notes, pourquoi ?
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
		x = postJSONData(iObeyaURL + "/s/j/elements/delete", jsonNote);
		x.onload = function() {
			commitiObeyaChanges(afterCommit);
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

function createiObeyaNodeInTrash(iObeyaObjid, afterCommit) {
	try {
		if (iObeyaObjid.length == 0 ) // pas d'élément à mettre à la corbeille
				return;
		
		var elements = getBoardSharedElement(iObeyaObjid);
		
		console.log("Corbeille :");
		console.log(iObeyaObjid);

		var jsonNote = JSON.stringify(elements);
		
		var x = postJSONData(iObeyaURL + "/s/j/boardShared", jsonNote);
		x.onload = function() {
			commitiObeyaChanges(afterCommit);
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

function getBoardSharedElement(iObeyaObjid) {
	var sharedElt = {};
	sharedElt['@class'] = "com.iobeya.dto.BoardSharedElementDTO";
	sharedElt.container = {
		"@class": "com.iobeya.dto.EntityReferenceDTO",
        "id": iObeyaNodes[iObeyaObjid].boardid, // a tester au debug
        "type": "com.iobeya.dto.BoardDTO"
	};
	sharedElt.ids = iObeyaObjid;
	sharedElt.kind = "trashBox";

	return [sharedElt];
}

/*** Commit des changements iObeya ***/
// TODO : fonction à relire par Vivien

function commitiObeyaChanges(afterCommit, idNoteiObeya) {
	var xhttpr=[]; // tableau d'object Jscript
	
	try {
		
		// On boucle sur l'ensemble des boards.

		for (i in g_iO_boards){
			
        	xhttpr[i] = getJSONData(iObeyaURL + "/s/j/meeting/commit/" + iO_clientId + "?roomId=" + iO_activeRoom.id + "&boardId=" +g_iO_boards[i].id); // requête jsonhttp Async
			
			xhttpr[i].onload = function() { // fonction Asynchrone appelée sur la fin de l'appel http.
					var jsonResponse = JSON.parse(this.responseText);
					console.log(jsonResponse);

					if (jsonResponse.result == "error" && idNoteiObeya != null) {

						// En cas d'erreur du commit, on indique que la synchronisation a échoué et met à jour le status de la synchro dans le RIDA.
						var ridaObject = getRidaObjectByiObeyaId(ridaNodes, idNoteiObeya);
						if (ridaObject != null) {
							console.log("Erreur de synchronisation de la tâche RIDA " + ridaObject.idRida);
							updateRidaStatusSync(ridaObject.idRida, parseStatus(status_failed));
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
function createRida(iObeyaNote, iObeyaOverlapping, nodesiObeya) {

	try {
		var itemCreateInfo = new SP.ListItemCreationInformation();
		var oListItem = oList.addItem(itemCreateInfo);
		
		// Récupérer les objets qui chevauchent le post-it
	    iObeyaOverlapping = findOverlappingElements(iObeyaNote, nodesiObeya);
		var iObeyaLabel = getAssociatedLabel(iObeyaOverlapping);
		var iObeyaPercentCompleteSticker = getAssociatedPercentCompleteSticker(iObeyaOverlapping);
		var iObeyaPrioritySticker = getAssociatedPrioritySticker(iObeyaOverlapping);

	    // Extraire les champs de l'objet note puis des étiquettes et stickers associés à des données RIDA
	    oListItem = getNoteProperties(oListItem, iObeyaNote, nodesiObeya);
	    oListItem = getLabelProperties(oListItem, iObeyaLabel);
	    oListItem = getPercentCompleteStickerProperties(oListItem, iObeyaPercentCompleteSticker);
	    oListItem = getPriorityStickerProperties(oListItem, iObeyaPrioritySticker);
		
		// Date de création
		oListItem.set_item(dataToSynchronize["creationDate"], new Date(iObeyaNote.creationDate));
		
		// Synchronisé avec iObeya : Oui
		oListItem.set_item(dataToSynchronize["synchroStatus"], synchro_status_done);
		
		//Nom du tableau sur lequel est la note	
        oListItem.set_item(dataToSynchronize["PanneauiObeya"], iObeyaNote.boardname);

	    oListItem.update();
		clientContext.load(oListItem);
    
    	console.log("Create RIDA " + iObeyaNote.id);   
	    return true;
	}
	catch(e) {
		throw e;
	}
}

/*** Mise à jour d'une donnée RIDA ***/
function updateRida(ridaId, iObeyaNote, iObeyaOverlapping, nodesiObeya) {

	try {
	    var oListItem = oList.getItemById(ridaId);
	    
	    // Récupérer les objets qui chevauchent le post-it
	    iObeyaOverlapping = findOverlappingElements(iObeyaNote, nodesiObeya);
		var iObeyaLabel = getAssociatedLabel(iObeyaOverlapping);
		var iObeyaPercentCompleteSticker = getAssociatedPercentCompleteSticker(iObeyaOverlapping);
		var iObeyaPrioritySticker = getAssociatedPrioritySticker(iObeyaOverlapping);

	    // Extraire les champs de l'objet note puis des étiquettes et stickers associés à des données RIDA
	    oListItem = getNoteProperties(oListItem, iObeyaNote, nodesiObeya);
	    oListItem = getLabelProperties(oListItem, iObeyaLabel);
	    oListItem = getPercentCompleteStickerProperties(oListItem, iObeyaPercentCompleteSticker);
	    oListItem = getPriorityStickerProperties(oListItem, iObeyaPrioritySticker);

	    // Date de modification
		oListItem.set_item(dataToSynchronize["modificationDate"], new Date(iObeyaNote.modificationDate));
        
        //Mise à jour du tableau		
        oListItem.set_item(dataToSynchronize["PanneauiObeya"], iObeyaNote.boardname);

	    oListItem.update();
	    
    	console.log("Update RIDA " + iObeyaNote.id);
	
	    return true;
	}
	catch(e) {
		throw e;
	}
}


/*** Mise à jour du statut de synchronisation d'une donnée RIDA ***/
function updateRidaStatusSync(ridaId, status) {

	try {
	    var oListItem = oList.getItemById(ridaId);
    	oListItem.set_item(dataToSynchronize["synchroStatus"], status);
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
    	oListItem.set_item(dataToSynchronize["synchroiObeya"], false);
    	oListItem.set_item(dataToSynchronize["idiObeya"], null);
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

function getNoteProperties( oListItem, iObeyaNote, nodesiObeya) {
    var resteafaire, consomme = null, dueDate, statusObject;
    
	try {

		
		if (iObeyaNote.props.responsible != null && iObeyaNote.props.responsible != "") { // champs responsible (en bas à gauche ) des notes iObeya > Rida "Resteafaire"  dans la note utilisée
            resteafaire = parseWorkload(iObeyaNote.props.responsible);
 
            if (resteafaire == undefined || resteafaire == null) {
				throw new InterfaceException("Post-it \"" + iObeyaNote.props.content + "\" : Reste à faire \"" + iObeyaNote.props.responsible + "\" non reconnue, veuillez corriger la saisie et relancer la synchronisation.");
			   }

            oListItem.set_item(dataToSynchronize["resteafaire"], resteafaire);            

            if (iObeyaNote.props.title != null && iObeyaNote.props.title != "" ) { // champs Title (en haut ) > Charge R/H dans la note utilisée
			     consomme = parseWorkload(iObeyaNote.props.title);
			     if (consomme == undefined || consomme == null) {
				    throw new InterfaceException("Post-it \"" + iObeyaNote.props.content + "\" : Consommé \"" + iObeyaNote.props.title + "\" non non reconnue, veuillez corriger la saisie et relancer la synchronisation.");
			     }
				oListItem.set_item(dataToSynchronize["consomme"],consomme);
		    } else {
				oListItem.set_item(dataToSynchronize["consomme"], "0"); // on place zero dans le consommé, à la prochaine itération on ne fera plus cette manip.
				
				// maintenant on vérifie si la charge "workload" est déjà positionnée dans le rida
				// si ce n'est pas le cas, on positionne == consommé ( on positionne la première fois)
				if (iObeyaNote.props.workload == null || iObeyaNote.props.workload == "" ){ // l'objet n'existe pas ou est null.
					oListItem.set_item(dataToSynchronize["workload"], resteafaire); // on place l'estimé dans le workload s'il n'est pas déjà rempli
				}	
			}
		
		iObeyaNote.toreupdate = true ; // pour forcer la mise à jour de la note. ( les textes (J/H xxxx) apparaitront donc dans la note iObeya dans l'outil )	
		}

		// Date d'échéance
		if (iObeyaNote.props.date != null && iObeyaNote.props.date != "") { // champs date (en bas à droite ) > Rida_due_Date  dans la note utilisée
			dueDate = new Date(reverseDate(iObeyaNote.props.date));
			if (dueDate == undefined || dueDate.getTime() == 0) {
				throw new InterfaceException("Post-it \"" + iObeyaNote.props.content + "\" : date d'échéance \"" + iObeyaNote.props.date + "\" non reconnue, veuillez corriger la saisie et relancer la synchronisation.");
			}
			oListItem.set_item(dataToSynchronize["dueDate"], dueDate);
		}
		
		// Sujet de la tâche
		if (iObeyaNote.props.content != null) {
			oListItem.set_item(dataToSynchronize["subject"], iObeyaNote.props.content);
		}

		// Statut
		statusObject = findNoteStatus(iObeyaNote, nodesiObeya);
		oListItem.set_item(dataToSynchronize["status"], statusObject.status);
		
		// Echéance ferme (la note est en rouge)
		if (iObeyaNote.color == NOTE_WARNING_COLOR) {
			oListItem.set_item(dataToSynchronize["firmDeadline"], true);
		}
		else {
			oListItem.set_item(dataToSynchronize["firmDeadline"], false);
		}

		// ID iObeya
		oListItem.set_item(dataToSynchronize["idiObeya"], iObeyaNote.id);
		
		// Synchronisé avec iObeya : Oui
		oListItem.set_item(dataToSynchronize["synchroiObeya"], true);

		return oListItem;
	}
	catch(e) {
		throw e;
	}
}


/*** Récupère les propriétés intrinsèques au post-it pour la mise à jour RIDA ***/
/* version pour iObeya 3.1
function getNoteProperties(ridaItem, iObeyaNote, nodesiObeya) {
	try {
		// Instance / Date de début
		if (iObeyaNote.label1 != null && iObeyaNote.label1 != "") {
			var startDate = new Date(reverseDate(iObeyaNote.label1));
			if (startDate === undefined || startDate.getTime() == 0) {
				throw new InterfaceException("Post-it \""+iObeyaNote.contentLabel+"\" : date de début \"" + iObeyaNote.label1 + "\" non reconnue.");
			}
			ridaItem.set_item(dataToSynchronize["startDate"], startDate);
		}

		// Date d'échéance
		if (iObeyaNote.label2 != null && iObeyaNote.label2 != "") {
			var dueDate = new Date(reverseDate(iObeyaNote.label2));
			if (dueDate === undefined || dueDate.getTime() == 0) {
				throw new InterfaceException("Post-it \""+iObeyaNote.contentLabel+"\" : date d'échéance \"" + iObeyaNote.label2 + "\" non reconnue.");
			}
			ridaItem.set_item(dataToSynchronize["dueDate"], dueDate);
		}
		
		// Charge
		if (iObeyaNote.label0 != null && iObeyaNote.label0 != "" && iObeyaNote.label0) {
			var workload = parseWorkload(iObeyaNote.label0);
			if (workload === undefined || workload == null) {
				throw new InterfaceException("Post-it \""+iObeyaNote.contentLabel+"\" : charge \"" + iObeyaNote.label0 + "\" non reconnue.");
			}
			ridaItem.set_item(dataToSynchronize["workload"], workload);
		}

		// Sujet
		if (iObeyaNote.contentLabel != null) {
			ridaItem.set_item(dataToSynchronize["subject"], iObeyaNote.contentLabel);
		}

		// Statut
		var statusObject = findNoteStatus(iObeyaNote, nodesiObeya);
		ridaItem.set_item(dataToSynchronize["status"], statusObject.status);
		
		// Echéance ferme
		if (iObeyaNote.color == NOTE_WARNING_COLOR) {
			ridaItem.set_item(dataToSynchronize["firmDeadline"], true);
		}
		else {
			ridaItem.set_item(dataToSynchronize["firmDeadline"], false);
		}

		// ID iObeya
		ridaItem.set_item(dataToSynchronize["idiObeya"], iObeyaNote.id);
		
		// Synchronisé avec iObeya : Oui
		ridaItem.set_item(dataToSynchronize["synchroiObeya"], true);

		return ridaItem;
	}
	catch(e) {
		throw e;
	}
}
*/


/*** Récupère les propriétés intrinsèques à l'étiquette "Acteur" pour la mise à jour RIDA ***/
function getLabelProperties(ridaItem, iObeyaLabel) {
		var user=""; // par defaut si le label ne correspond pas à un terme acteurs on position une chaine vide dans le rida / acteur
    
    try {

		if (iObeyaLabel != null) { // le iObeyaLabel n'est pas vide
			for (var i in actorsTermsList) { // on vérifie que cela correspond bien à un terme acteurs...
				if (actorsTermsList[i].get_name() == iObeyaLabel.contentLabel) {
					user = actorsTermsList[i].get_id().toString();
				}
			}
			ridaItem.set_item(dataToSynchronize["actor"], user);
		}
		else { // il est vide...
			ridaItem.set_item(dataToSynchronize["actor"], null);
		}
		
		return ridaItem;
	}
	catch(e) {
		throw e;
	}
	return ridaItem;
}

/*** Récupère les propriétés intrinsèques au sticker "% achevé" pour la mise à jour RIDA ***/
function getPercentCompleteStickerProperties(ridaItem, iObeyaPercentCompleteSticker) {
	try {
		if (iObeyaPercentCompleteSticker != null) {
			for (value in percentageStickerMapping.map) {
				if (percentageStickerMapping.map[value].id == iObeyaPercentCompleteSticker.stickerImage.id) {
					ridaItem.set_item(dataToSynchronize["percentComplete"], value);
				}
			}
		}
		else {
			ridaItem.set_item(dataToSynchronize["percentComplete"], null);
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
			for (value in priorityStickerMapping.map) {
				if (priorityStickerMapping.map[value].id == iObeyaPrioritySticker.stickerImage.id) {
					ridaItem.set_item(dataToSynchronize["priority"], value);
				}
			}
		}
		else {
			ridaItem.set_item(dataToSynchronize["priority"], null);
		}

			
		return ridaItem;
	}
	catch(e) {
		throw e;
	}
}