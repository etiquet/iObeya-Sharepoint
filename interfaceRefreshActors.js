// interfaceRefreshActors.js > appelé depuis la page callRefreshActors.aspx

/*** Récupération de la liste des acteurs de la banque de termes SharePoint ***/

/* Erreur ...

 Cette fonction ne marche pas.
 il faut extraire les items d'items de groups items
 
 la méthode n'est pas spontanée, car plusieurs concepts sharepoints sont manipulés
 ne semble pas disposer de methodes logiques pour descendre dans l'arborescence
 sequence suivante à vérifier...
 
 termStore
 	TermSets
 		Termgroup
			terms
				subterms?
 

 plusieurs recherche infructueuse sur internet
 
 le site suivant semble proposer des méthodes pour aider ... à tester
 https://cann0nf0dder.wordpress.com/2013/04/09/accessing-taxonomy-term-store-with-jsom/
 
*/

////// le code ci-dessous est une copie partielle du site mentionné ci-dessus
////// debut du code copié depuis internet

var termsList = "Terms: \n"

function showTerms(termSetId) {
	//We need to load and populat the matching Term Set first.
	var termSetEnum = termSets.getEnumerator();
	while (termSetEnum.moveNext()) {
		var currentTermSet = termSetEnum.get_current();
		if (currentTermSet.get_id() == termSetId) {

		//If termSet Matches, then get all terms.
		context.load(currentTermSet);
		context.executeQueryAsync( 
			function () {
				//Load terms
				var terms = currentTermSet.get_terms();
				context.load(terms);

				context.executeQueryAsync(

					function () {
						var termsEnum = terms.getEnumerator();
						while (termsEnum.moveNext()) {
							var currentTerm = termsEnum.get_current();
							var termName = currentTerm.get_name();
							var termId = currentTerm.get_id();
							termsList += termName + ": " + termId;

							//Check if term has child terms

							if (currentTerm.get_termsCount() > 0) {
							//Term has sub terms.
							recursiveTerms(currentTerm, 1);
							}

							alert(termList);
						}
					},function () { /*failure to load terms*/ });
		},	function () { /*failure to load current term set*/ });

		break; 
		}
	}
}
 
function recursiveTerms(currentTerm, nestedLoop) {
//Loop count for formatting purpose.
var loop = nestedLoop + 1;
//Get Term child terms
var terms = currentTerm.get_terms();
	
	context.load(terms);
	context.executeQueryAsync(
		function () {
			var termsEnum = terms.getEnumerator();
			while (termsEnum.moveNext()) {
				var newCurrentTerm = termsEnum.get_current();
				var termName = newCurrentTerm.get_name();
				termId = newCurrentTerm.get_id();

				//Tab Out format.

				for (var i = 0; i < loop; i++) {
				termsList += "\t";
				}

				termsList += termName + ": " + termId;

				//Check if term has child terms.

				if (currentTerm.get_termsCount() > 0) {
						//Term has sub terms.
						recursiveTerms(newCurrentTerm, loop);
						}
				}
		}, function () { /*failure to load terms*/ });	
}

////// fin du code copié depuis internet

var g_actorsTermsListTable = []; // multi tableau

function retrieveActorsList_refresh() {
    var context, taxonomySession, termStore, parentTerm, terms, termgrp,termsfromsubgrp, termSet, termsEnumerator, currentTerm;
   
	context = SP.ClientContext.get_current();
	taxonomySession = SP.Taxonomy.TaxonomySession.getTaxonomySession(context);
    termStore = taxonomySession.get_termStores().getById(TAXONOMY_ID);

	for (var i in ACTORSSUBSET_ID) { // ne prendre que les sub list défini comme liée au panneau (cf config file)
			g_actorsTermsListTable[i] = new Array();
		
			termSet = termStore.getTermSet(ACTORSSET_ID); // termsets
			termgrp = termSet.get_groups();
		
		//getTerm(ACTORSSUBSET_ID[i]);  //load child Term(s);

			context.load(termgrp);
		
			context.executeQueryAsync( 
				Function.createDelegate(this, function (sender, args) {
				termsfromsubgrp=termgrp.get_termSets();
				terms=termsfromsubgrp.getAllTerms();
				termsEnumerator = terms.getEnumerator();
				// Récupération des acteurs
				while (termsEnumerator.moveNext()) {
					currentTerm = termsEnumerator.get_current();
					g_actorsTermsListTable[i].push(currentTerm);
					}
			}), Function.createDelegate(this, function (sender, args) { alert('The error has occured: ' + args.get_message());	}));
	} // for (var i...)
}

/*** Action de synchronisation avec iObeya ***/
//TODO : faire une boucle par panneau... VIVIEN ???

function syncActors_refresh(iObeyaNodes) {
	var resourceRoll, labelList, labelsToCreate, rollObject, id, actorFound, i, j, ridaFormatedObject, newLabel;
	try {
		
		for (i in l_boardid){
			// 	Pour l'adaptation multipanneau, 2 nouvelles variable à utiliser	
			//	g_actorsTermsListTable[i]
			//	g_iO_boards[g_defaultboard_index].id
			
			// 1) Récupération des étiquettes actuellement présente au sein du bloc "Ressources" du panneau
			
			rollObject = findRollbyLabelName(iObeyaNodes, RESOURCES_ZONE,g_iO_boards[i].id); // le roll ressources lié au panneau
			
			labelList = findActorsInRectangle(rollObject.x, rollObject.y, rollObject.x + rollObject.width, rollObject.y + rollObject.height);
			// note :: la liste de label renvoi tous les labels de tous les panneaux ( pas de filtrage par panneau )			
			
			// 2) Liste des nouvelles étiquettes à placer
			
			labelsToCreate = []; // objet vidé
			
			for (id in g_actorsTermsListTable[i]) {
				actorFound = false;
				for (j in labelList) { // on analyse s'il manque un label dans la zone
					if (g_actorsTermsListTable[i][id].get_name() === labelList[j].contentLabel && 
						labelList[j].boardid === g_iO_boards[i].id) { // et que le label est sur le panneau en question
						actorFound = true;
					}
				}
				
				if (actorFound === false) { // si oui on créé le label dans la zone
					// Créer le label
					ridaFormatedObject = getRidaFormatedObject(g_actorsTermsListTable[i][id].get_name());
					newLabel = createActorLabel(ridaFormatedObject);
					newLabel.boardid=g_iO_boards[i].id;
					
					// Push le label
					iObeyaNodes.push(newLabel);

					// Placer le label
					newLabel = new placeElement(rollObject, newLabel, RESOURCES_ZONE, iObeyaNodes, Array());
					labelsToCreate.push(newLabel);
				}
			}

			// Rafraîchissement du rouleau
			updateiObeyaNode([rollObject]);

			// Commit les labels
			if (labelsToCreate.length > 0) { 
				createiObeyaNode(labelsToCreate, close); // si ok on ferme la fenètre du navigateur
			} else {
				close(); // pas de label à créer
			}
			
		}
			
	} catch (e) {
		// On informe l'utilisateur de la raison de l'erreur
		displayException(e);
    }
	
	function getRidaFormatedObject(actor) {
		var ridaObj = [];
		ridaObj.creationDate = new Date().getTime();
		ridaObj.actor = actor;
		
		return ridaObj;
	}
	
}
