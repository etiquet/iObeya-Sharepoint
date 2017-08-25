/* interfaceRefreshActors.js > appelé depuis la page callRefreshActors.aspx


Arborescence de la taxonomie dans sharepoint

 termStore (taxonomyid) : 
 		Termgroup : "Collection de sites - devptf.sharepoint.com-sites-pfe"
		 	TermSets : "ActeurTerme"
				terms : "SuiviBOE"
					terms : le nom de l'acteur


 Le principe est qu'il faut faire une query

1/ contexte et prépartion de la query
2/ context.load( <la donnée à aller cherchr> )
3/ execution de la query	
	context.executeQueryAsync(function(){
		//gestion du succès
	}, function (sender,args) {
		console.log(args.get_message());//gestion de l'erreur
	});	
	 
Attention : 
	
	faire un nouveau contexte / query nouveau avant d'appeler context.executeQueryAsync
	 sinon la fonction appelée en cas de succès ne fonctionne 
	 au vu de l'asynchronisme  : il faut contenir les variable dans une fonction si la méthode est appelée
	 	si faire plusieurs appel en boucle => mettre la query dans une fonction js separée.
		le js gèrera un contexte de variable en locale et il n'y aura pas n fonction qui tournent en // asynchrone

le site suivant semble propose des méthodes pour aider ... à comprendre
 https://cann0nf0dder.wordpress.com/2013/04/09/accessing-taxonomy-term-store-with-jsom/

*/


/*** 

	Récupération de la liste des acteurs de la banque de termes SharePoint 
	Query sharepoint en asynchrone...
	cette fonction est appellée en completion via callRefreshActors.aspx
	Cette url est placée dans une icône de rafraichissement des panneaux.
	L'utilisateur clique sur le lien, valide le message et lance l'url
	callRefreshActors.aspx
	
	callRefreshActors.aspx appelle ensuite également la fonction checkIn(syncActors_refresh); (voir plus bas) qui effectue la synchronisation
	
***/


// TODO : modifier le code pour que cela prenne compte d'une liste SP d'acteur et non pas de taxonomy


var g_actorsTermsListTable = [];  // multi tableau
var g_actorsTermsFullLoadCount = 0;  // pour être sûr d'avoir tout loadé...
var g_countl = 0;  // pour être sûr d'avoir tout loadé...

function retrieveActorsList_refresh(panneau) { // Initialisation de l'array multitableau
	// il faut parser l'url pour déterminer le nom du panneau donc celui de la site concernée
	// Initialisation des paramètres globaux
	var syncID;

	if (!panneau) {
		alert("L'url d'appel ne contient par le nom du panneau en parametre (?boardname=xxx),\n"
			+ "impossible de rafraichir les acteurs.\n"
			+ "Contactez l'administrateur du panneau."
		);
		return;
	}
	try {
		for (var entry in SYNC_PROPERTIES_MAP) {
			panneau = decodeURI(panneau); // on decode en uri pour permettre les espaces et autres caractères

			if (SYNC_PROPERTIES_MAP[entry].BOARDSTOSYNC instanceof Array) {
				for (var arr in SYNC_PROPERTIES_MAP[entry]['BOARDSTOSYNC'])
					if (panneau.includes(SYNC_PROPERTIES_MAP[entry]['BOARDSTOSYNC'][arr])) // not an array
						syncID = entry;
			} else if (panneau.includes(SYNC_PROPERTIES_MAP[entry].BOARDSTOSYNC)) // not an array
				syncID = entry;
		}

		if (!syncID) {
			alert("Le panneau spécifié n'a pas été trouvé dans le fichier de configuration. Arret"
			);
			return;
		}
		g_syncID = syncID;

		// Chargement des variables globales
		// If FAILED ? --> throw exception. Caught below
		loadSyncConf(syncID);
	} catch (e) {
		displayException(e);
	}
	// Ensuite, en fonction des propriétés trouvées, on part sur la taxonomie ou la liste SP
	if (window.hasOwnProperty('ACTORLIST_TITLE'))
		retrieveActorsList_refresh_splist();
	else
		retrieveActorsList_refresh_taxonomy();
}

/** Fonction qui gère la liste d'acteurs utilisant une liste sharepoint dédiée */
var g_spActorsList; // TODO: voir pour eviter une variable globale pour syncactors liste, voir si la propriete peux être passee dans ongetquerysuceed.
var g_collcontxtListItem2;

function retrieveActorsList_refresh_splist() {
	try {
		g_collcontxtListItem2 = new SP.ClientContext.get_current(); // new fresh object
		var l_oList = g_collcontxtListItem2.get_web().get_lists().getByTitle(ACTORLIST_TITLE); // fresh variable from actor liste
		var l_camlQuery = new SP.CamlQuery();
		l_camlQuery.set_viewXml("<View />");
		g_spActorsList = l_oList.getItems(l_camlQuery);
		g_collcontxtListItem2.load(g_spActorsList);
		g_collcontxtListItem2.executeQueryAsync(Function.createDelegate(this, this.onGetQuerySucceededRetrieveActorsList), Function.createDelegate(this, this.onQueryFailed));
	} catch (e) {
		throw new InterfaceException("Les données de la liste d'acteurs \"" + ACTORLIST_TITLE + "\" n'ont pas pu être trouvées dans Sharepoint");
	}
}

/** fonction async de complétion la requête sharepoint */
function onGetQuerySucceededRetrieveActorsList(sender, args) {
	var fields, listItemEnumerator, actorname, panneauactor;
	g_actorsTermsList = []; // vider le tableau d'objet ( on déréférence l'ancienne valeur )
	g_actorsTermsListTable = []; // la liste d'array d'acteurs par panneau

	try {
		console.log("Retrieve Actors sharepoint list items");
		console.log(g_spActorsList);

		// initialise la liste des arrays d'acteurs
		for (var panneau in BOARDSTOSYNC) {
			g_actorsTermsListTable[BOARDSTOSYNC[panneau]] = [];
		}
		// on récupère la liste d'acteur
		listItemEnumerator = g_spActorsList.getEnumerator();
		while (listItemEnumerator.moveNext()) {
			fields = listItemEnumerator.get_current().get_fieldValues();
			actorname = formateFieldToExport(fields[ACTORLIST_MATCHINGNAME["actor"]]).trim();
			panneauactor = formateFieldToExport(fields[ACTORLIST_MATCHINGNAME["PanneauiObeya"]]).trim();

			if (actorname)
				g_actorsTermsList.push(actorname); // on ajouter l'acteur dans la liste

			if (panneauactor) {  // on ajoute l'entrée aux listes dédiées par panneau
				for (var panneau in g_actorsTermsListTable) {
					if (panneauactor.toLocaleLowerCase() === panneau.toLocaleLowerCase()) { // s'il n'est pas dans la liste on ne le traite pas
						g_actorsTermsListTable[panneau].push(actorname);
					}
				}
			}
		}// while

		// on appelle la fonction qui effectue le refresh ( on se logue d'abord sur le iobeya et on récupère les données)
		checkIn(syncActors_refresh);

	} catch (e) {
		alert( "Une erreur est survenue à la lecture de la liste acteurs sharepoint : " + e.message
			+ "\n vérifiez à tout hasard le fichier de configuration interfaceConfig.js ou votre liste sharepoint \n "
		);
	}
}

function retrieveActorsList_refresh_taxonomy() {  // Initialisation de l'array multitableau

	checkIn();
	try {
		g_actorsTermsFullLoadCount = ACTORSSUBSET_ID.length;

		for (var i in ACTORSSUBSET_ID) {
			getActorsByTermsID(i); // asynchrone !
		}
		waitUnitTermsareFullyLoaded(); // appelle la fonction en paramètre quand fini

	} catch (e) {
		displayException(e);
	}
}

function waitUnitTermsareFullyLoaded(donefnct) {
	// Attendre la fin des process iObeya avant de faire le commit Sharepoint

	var timerId = window.setInterval(function(){
		console.log("timer : " + g_countl++);

		if (!g_actorsTermsFullLoadCount) {
			// Tous les process de loading des terms sont terminés
			console.log("Loaded terms complete" + g_actorsTermsListTable.length );
			clearInterval(timerId);
			/* Mise à jour du bloc "Ressources"
				la fonction de connexion à iObeya, qui appelle lorsque le login est terminé appelle
				la fonction de (syncActors_refresh) */
			checkIn(syncActors_refresh);
		}
	}, 500);
}


// helper qui permet de récurérer les sous-termes d'un terme
// permet aussi de contenir les variables avec les appels asynchrones de Sharepoint
// dans un contexte javascript

function getActorsByTermsID(subsetiDid){

	var l_array=[];
	var boardname 		= BOARDSTOSYNC[subsetiDid];
	var context 		= SP.ClientContext.get_current();
	var taxSession 		= SP.Taxonomy.TaxonomySession.getTaxonomySession(context);
	var termStores 		= taxSession.get_termStores();
	var termStore 		= termStores.getById(TAXONOMY_ID);	
	var parentTermId 	= ACTORSSUBSET_ID[subsetiDid]; //
	var parentTerm 		= termStore.getTerm(parentTermId);
	var terms 			= parentTerm.get_terms();  //load child Terms
	
	try {
		context.load(terms);
		context.executeQueryAsync(function(){
			
			console.log("**"+ boardname+" **");

			for(var i = 0; i <terms.get_count();i++){
							var l_term =terms.getItemAtIndex(i);
							l_array.push(l_term.get_name());
						}
			g_actorsTermsListTable[BOARDSTOSYNC[subsetiDid]] = l_array;	 // TODO: FIX à vérifier que cela fonctionne toujours
			g_actorsTermsFullLoadCount--;
			
			}, function(sender,args){
					console.log(args.get_message());    
			});

	} catch(e) {
		displayException(e);
	}
	return l_array; // ne devrait pas passer ici...
}

/*** 

	Action de synchronisation de la liste d'acteur (par panneau) avec iObeya 
	utilise g_actorsTermsListTable et g_iO_boards[g_defaultboard_index].id
	cette fonction est appellée en completion de la function : 
		checkIn(syncActors_refresh); 
		qui est appelée dans le fichier callRefreshActors.aspx
		ce lien est placé dans une icône de rafraichissement des panneaux.
		l'utilisateur clique sur le lien, valide le message et lance l'url
		callRefreshActors.aspx
	
	
***/


function syncActors_refresh(iObeyaNodes) {
	var rollObject, labelList, labelsToCreate,labelsToCreate,newLabel,ridaFormatedObject;

	/*try {*/
		
		labelsToCreate = []; // objet vidé
		
		for (var i in BOARDSTOSYNC){
			// Pour l'adaptation multipanneaux
			// 2 nouvelles variables à utiliser :
				//	g_actorsTermsListTable[i]
				//	g_iO_boards[g_defaultboard_index].id
			
			// 1) Récupération des étiquettes actuellement présente au sein du bloc "Ressources" du panneau
			

			/* // on récupère le l_boarid depuis getBoardidFromName (l'ordre de g_iO_boards[i] n'est pas identique à celui de BOARDSTOSYNC[i] , il faut faire un lookup.)*/
			
			var l_boarid=getBoardidFromName(BOARDSTOSYNC[i]); 
			
			// le roll ressources lié au panneau
			rollObject = findRollbyLabelName(iObeyaNodes, RESOURCES_ZONE,l_boarid); 
			
			// La fonction findActorsInRectanglerenvoi tous les labels"Actors" de tous les panneaux
			// il n'y a pas de filtrage par panneau, le filtrage est a faire ensuite...

			// on récupère la liste des actors déjà existant sur le panneau
			
			labelList = findActorsInRectangle(rollObject.x, rollObject.y, rollObject.x + rollObject.width, rollObject.y + 						rollObject.height,iObeyaNodes); //
			
			// 2) Liste des nouvelles étiquettes à placer

			var _obj = g_actorsTermsListTable[BOARDSTOSYNC[i]]; // l'array d'array() récupérés de sharepoint
			
			if (_obj) // /!\ peux etre nul / vide... on protère la boucle
				for (var id in _obj) {
					var _actorFound = false;
					var _actor = _obj[id]; // on extrait la variable

					if (labelList) // au cas où la liste est null		
						for (var j in labelList) { // on analyse s'il manque un label dans le roll
							if ( _actor === labelList[j].contentLabel ) // le label correspond ?
								if ( labelList[j].boardid === l_boarid) { // et que le label est sur le panneau en question
												_actorFound = true; // oui on positionne le flag
								}
							}

					if (_actorFound === false) { // on créé ici le label dans le roll
						// Créer le label
						ridaFormatedObject = getRidaFormatedObject(_actor,BOARDSTOSYNC[i]);
						newLabel = createActorLabel(ridaFormatedObject);

						if (!newLabel)
								var debug= true;

						// Placer le label
						iObeyaNodes.push(newLabel); // on ajouter le label dans l'array pour le placement (en mémoire)
						
						newLabel = new placeElement(rollObject, newLabel, RESOURCES_ZONE, iObeyaNodes, Array()); // positionne le label

						if (!newLabel)
								var debug= true;

						if (newLabel)
						labelsToCreate.push(newLabel); // on ajouter le label dans iObeya (déplacé...)
							
						}//if (actorFound === false)
				} //for (var id in g_actorsTermsListTable) {
				
				g_rollsToRefresh.push(rollObject); // on ajoute le roll dans la liste des rolls à m.a.j

			} // for (var i in g_iO_boards){
		
			// On créer les nouveaux labels
			if (labelsToCreate.length > 0) { 
				//updateiObeyaNode(g_rollsToRefresh); // forcément des rolls à mettre à jour, bug v3.1 sur le refresh
				createiObeyaNode(labelsToCreate, null); // si ok on appelle la méthode close() qui ferme la fenètre du navigateur
				}
			waitUnitCommitDone4closingWindows(); // on attend que l'ensemble de la queue de commit iObeya est vidée
		
	/*} catch (e) {
		// On informe l'utilisateur de la raison si l'erreur
		alert(e);
    }*/
	
	
	// On crée un objet Actor de type rida avec le minimum vital pour créer un label
	
	function getRidaFormatedObject(actor,panneau) { 
		var ridaObj = [];
		ridaObj.creationDate = new Date().getTime();
		ridaObj.actor = actor;
		ridaObj.PanneauiObeya = panneau;
		return ridaObj;
	}
	
}


function waitUnitCommitDone4closingWindows() {
	// Attendre la fin des process iObeya avant de fermer la fenêtre
	var timerId = window.setInterval(function(){
		console.log("timer : " + g_countl++);
			
		if (requestQueue.length == 0 ) {
			// Tous les process iObeya ont été lancés, et tous sont terminés
			console.log("Commit iObeya are done : closing windows");
			clearInterval(timerId);
			close();
		}
	}, 1000);
}
	
	