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
		
		// Récupérer les objets qui chevauchent le post-it
	    var iObeyaOverlapping = findOverlappingElements(iObeyaNote, nodesiObeya);
		var iObeyaLabel = getAssociatedLabel(iObeyaOverlapping);
		var iObeyaPercentCompleteSticker = getAssociatedPercentCompleteSticker(iObeyaOverlapping);
		var iObeyaPrioritySticker = getAssociatedPrioritySticker(iObeyaOverlapping);

	    // Extraire les champs de l'objet note puis des étiquettes et stickers associés à des données RIDA
	    oListItem = getNoteProperties(oListItem, iObeyaNote, nodesiObeya);
	    oListItem = getLabelProperties(oListItem, iObeyaLabel);
	    oListItem = getPercentCompleteStickerProperties(oListItem, iObeyaPercentCompleteSticker);
	    oListItem = getPriorityStickerProperties(oListItem, iObeyaPrioritySticker);
		
		// Date de création
		oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["creationDate"], new Date(iObeyaNote.creationDate));
		
		// Synchronisé avec iObeya : Oui
		oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["synchroStatus"], synchro_status_done);
		
		//Nom du tableau sur lequel est la note	
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["PanneauiObeya"], iObeyaNote.boardname);

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
function updateRida(ridaId, iObeyaNote, nodesiObeya) {

	try {
	    var oListItem = oList.getItemById(ridaId);
	    
	    // Récupérer les objets qui chevauchent le post-it
	    var iObeyaOverlapping = findOverlappingElements(iObeyaNote, nodesiObeya);
		var iObeyaLabel = getAssociatedLabel(iObeyaOverlapping);
		var iObeyaPercentCompleteSticker = getAssociatedPercentCompleteSticker(iObeyaOverlapping);
		var iObeyaPrioritySticker = getAssociatedPrioritySticker(iObeyaOverlapping);

	    // Extraire les champs de l'objet note puis des étiquettes et stickers associés à des données RIDA
	    oListItem = getNoteProperties(oListItem, iObeyaNote, nodesiObeya);
	    oListItem = getLabelProperties(oListItem, iObeyaLabel);
	    oListItem = getPercentCompleteStickerProperties(oListItem, iObeyaPercentCompleteSticker);
	    oListItem = getPriorityStickerProperties(oListItem, iObeyaPrioritySticker);

	    // Date de modification
		oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["modificationDate"], new Date(iObeyaNote.modificationDate));
        
        //Mise à jour du tableau		
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["PanneauiObeya"], iObeyaNote.boardname);

	    oListItem.update();
	    
    	console.log("Update RIDA sur l'id iObeya :" + iObeyaNote.id);
	
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

function getNoteProperties( oListItem, iObeyaNote, nodesiObeya) {
    var resteafaire, consomme = null, dueDate, statusObject;
    
	try {

		// On traite les données liées à la charge
		
		// champs responsible (en bas à gauche ) des notes iObeya > Rida "Resteafaire"  dans la note utilisée
		if (iObeyaNote.props.responsible != null && iObeyaNote.props.responsible != "") { 

            resteafaire = parseWorkload(iObeyaNote.props.responsible); // le reste à faire
			
            if (resteafaire == undefined || resteafaire == null) { // soucis ?
				throw new InterfaceException("Post-it \"" + iObeyaNote.props.content + "\" : Reste à faire \"" + iObeyaNote.props.responsible + "\" non reconnue, veuillez corriger la saisie et relancer la synchronisation.");
			   }
				
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["resteafaire"], resteafaire);   // on place la valeur dans le RIDA         
			iObeyaNote.props.responsible=resteafaire + " J/H (RAF)"; // on met à jour l'objet en mémoire avec le texte au bout
			
			// champs Title (en haut ) > consommé R/H dans la note utilisée
			if (iObeyaNote.props.title != null && iObeyaNote.props.title != "" ) { 

					 consomme = parseWorkload(iObeyaNote.props.title); // consommé

					 if (consomme == undefined || consomme == null) { // soucis ?
						throw new InterfaceException("Post-it \"" + iObeyaNote.props.content + "\" : Consommé \"" + iObeyaNote.props.title + "\" non non reconnue, veuillez corriger la saisie et relancer la synchronisation.");
					 	}
				
					oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["consomme"],consomme);
					iObeyaNote.props.title=consomme+ " J/H (Consom.)"; // on met à jour l'objet en mémoire avec le texte au bout

				} else {
					/* 
						si consommé est null(vide) + raf non nul 
							> typiquement le cas si l'on rentre juste le RAF à l'initialisation de la tâche
						on place zero dans le consommé (à la prochaine itération l'algo ne fera plus cette manip.)
						et on force l'écriture du RAF dans le workload du RIDA.
					*/
					
					oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["consomme"], "0"); 
					iObeyaNote.props.title="0 J/H (Consom.)" ; // on met à jour l'objet en mémoire avec le texte au bout

					// Maintenant on vérifie si la charge "workload" dans l'objet iObeay en mémoire
					// "workload" n'est pas un attribut d'iObeya, il est donc vide par défaut
					// s'il est positionné c'est que l'object a été créé pour 
					// une synchro RIDA > iObeya
					// si vide ou null on en déduit que l'on peut positionner le "workload" dans le RIDA

					if (iObeyaNote.props.workload == null || iObeyaNote.props.workload == "" ){  // worload vide ?
						// on place l'estimé dans le workload s'il n'est pas déjà rempli
						oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["workload"], resteafaire); 
					}	
			}
			
			// pour forcer la mise à jour de la note. ( les textes (J/H xxxx) apparaitront donc dans la note iObeya dans l'outil )	
			iObeyaNote.toreupdate = true ; 
			
		} else {
			// si ici l'utilisateur essaye de saisir un consommé / sans raf, on le laisse faire.
			// champs Title (en haut ) > consommé R/H dans la note utilisée
			
			     if (iObeyaNote.props.title != null && iObeyaNote.props.title != "" ) { 
					 consomme = parseWorkload(iObeyaNote.props.title);
					 if (consomme == undefined || consomme == null) {
						throw new InterfaceException("Post-it \"" + iObeyaNote.props.content + "\" : Consommé \"" + iObeyaNote.props.title + "\" non non reconnue, veuillez corriger la saisie et relancer la synchronisation.");
					 	}
					 
					oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["consomme"],consomme);
					iObeyaNote.props.title=consomme+ " J/H (Consom.)"; // on met à jour l'objet en mémoire avec le texte au bout

					// pour forcer la mise à jour de la note. ( les textes (J/H xxxx) apparaitront donc dans la note iObeya dans l'outil )	
					iObeyaNote.toreupdate = true ;
				 }	
			}
			
			
		// Date d'échéance
		if (iObeyaNote.props.date != null && iObeyaNote.props.date != "") { // champs date (en bas à droite ) > Rida_due_Date  dans la note utilisée
			dueDate = new Date(reverseDate(iObeyaNote.props.date));
			if (dueDate == undefined || dueDate.getTime() == 0) {
				throw new InterfaceException("Post-it \"" + iObeyaNote.props.content + "\" : date d'échéance \"" + iObeyaNote.props.date + "\" non reconnue, veuillez corriger la saisie et relancer la synchronisation.");
			}
			oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["dueDate"], dueDate);
		}
		
		// Sujet de la tâche
		if (iObeyaNote.props.content != null) {
			oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["subject"], iObeyaNote.props.content);
		}

		// Statut
		statusObject = findNoteStatus(iObeyaNote, nodesiObeya);
		oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["status"], statusObject.status);
		
		// Echéance ferme (la note est en rouge)
		if (iObeyaNote.color == NOTE_WARNING_COLOR) {
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
			ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["startDate"], startDate);
		}

		// Date d'échéance
		if (iObeyaNote.label2 != null && iObeyaNote.label2 != "") {
			var dueDate = new Date(reverseDate(iObeyaNote.label2));
			if (dueDate === undefined || dueDate.getTime() == 0) {
				throw new InterfaceException("Post-it \""+iObeyaNote.contentLabel+"\" : date d'échéance \"" + iObeyaNote.label2 + "\" non reconnue.");
			}
			ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["dueDate"], dueDate);
		}
		
		// Charge
		if (iObeyaNote.label0 != null && iObeyaNote.label0 != "" && iObeyaNote.label0) {
			var workload = parseWorkload(iObeyaNote.label0);
			if (workload === undefined || workload == null) {
				throw new InterfaceException("Post-it \""+iObeyaNote.contentLabel+"\" : charge \"" + iObeyaNote.label0 + "\" non reconnue.");
			}
			ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["workload"], workload);
		}

		// Sujet
		if (iObeyaNote.contentLabel != null) {
			ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["subject"], iObeyaNote.contentLabel);
		}

		// Statut
		var statusObject = findNoteStatus(iObeyaNote, nodesiObeya);
		ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["status"], statusObject.status);
		
		// Echéance ferme
		if (iObeyaNote.color == NOTE_WARNING_COLOR) {
			ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["firmDeadline"], true);
		}
		else {
			ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["firmDeadline"], false);
		}

		// ID iObeya
		ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["idiObeya"], iObeyaNote.id);
		
		// Synchronisé avec iObeya : Oui
		ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["synchroiObeya"], true);

		return ridaItem;
	}
	catch(e) {
		throw e;
	}
}
*/


/*** Récupère les propriétés intrinsèques à l'étiquette "Acteur" pour la mise à jour RIDA ***/
// par defaut si le label ne correspond pas à un terme acteurs on position une chaine vide dans le rida / acteur

function getLabelProperties(ridaItem, iObeyaLabel) {
		var actorid= null, found=false;
	
    try {

		
		if( !verifieActorsList_sync() ) // on check si la liste des acteurs n'est pas vide... demande son avis à l'utilisateur / retry
				return ridaItem; // on ne traite pas sinon on risque de vider les acteurs
		
		// on vérifie (et détermine l'id du termes acteurs )
		
		if (iObeyaLabel != null) { // le iObeyaLabel n'est pas vide	
			for (var i in g_actorsTermsList) { // on vérifie que cela correspond bien à un terme acteurs...
				if (g_actorsTermsList[i].get_name().toLocaleLowerCase() == iObeyaLabel.contentLabel.toLocaleLowerCase()) {
					actorid = g_actorsTermsList[i].get_id().toString(); // l'id du terme dans la taxonomie de sharepoint
					found=true;
				}					
			}
			
			if (!found){ // Alert de l'utilisateur que le terme acteur ne sera pas positionné
					var breakpoint = true; // for debugging, not found
				
					alert(  "\nAttention : l'acteur *  " 
							+ iObeyaLabel.contentLabel 
							+ " * n'existe pas dans la banque de terme (taxonomie) des acteurs de Sharepoint."
							+ "\n\nLe champs 'acteur' de l'entrée dont le titre est : * " 
							+ iObeyaLabel.notetitle + " * , ne peut être positionné dans le portail Sharepoint, il sera vide. \n"
							+ "\nSi vous pensez que c'est une erreur ( orthographe ?), demandez à votre administrateur d'ajouter l'acteur dans la banque de terme.\n"
						  	+"\nLa synchronisation courante va se poursuivre. \nNotez les éléments de ce message avant de valider.\nLa prochaine synchronisation RIDA > iObeya effacera l'acteur de la note."
						);	
					g_syncErrors++; // on incrémente les erreur
					ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["actor"], null); // on vide l'acteur
					return ridaItem; // on s'arrête là
				}	
			
			ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["actor"], actorid);

		}
		else { // il est vide...
			ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["actor"], null);
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