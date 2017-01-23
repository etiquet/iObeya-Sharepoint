/*** Récupère les données Sharepoint ***/

function retrieveListItems() {
    var /*clientContext,*/ ridaNodes = [], oList, camlQuery;    
	try {
        //clientContext = new SP.ClientContext(SITEURL); // note : SITEURL define in interface config / SP define in sharepoint included JS
	    oList = clientContext.get_web().get_lists().getByTitle(LISTSHAREPOINT_TITLE); // note : LISTSHAREPOINT_TITLE define in interface config
	    camlQuery = new SP.CamlQuery();
	    camlQuery.set_viewXml("<View />");
	    this.collListItem = oList.getItems(camlQuery);
	    clientContext.load(collListItem);
	    clientContext.executeQueryAsync(Function.createDelegate(this, this.onGetQuerySucceeded), Function.createDelegate(this, this.onQueryFailed));
	    return ridaNodes;
	} catch (e) {
		throw new InterfaceException("Les données \"" + LISTSHAREPOINT_TITLE + "\" n'ont pas pu être trouvées dans Sharepoint");
    }
}

/*** Récupère un champ RIDA et le convertit pour import dans iObeya ***/
function formateFieldToExport(field) {
	try {
		// 1er cas : Date
		if (field instanceof Date) {
			return field.getTime();
		}
		
        // 2e cas : Object (acteur, responsable...)
		if (field instanceof Object) {
			try {
				field.get_lookupValue().length;
				// Cas 2.1 : utilisateur
				return field.get_lookupValue();
			} catch (e) {
				// Cas 2.2 : banque de termes
				return field.get_label();
			}
		}
	
		// Sinon, c'est une chaîne de caractères
		return field;
	} catch (e) {
		displayException(new InterfaceException("Erreur lors du formatage du champ " + field + "."));
	}
}

/*** 
	Succès de la récupération des données Sharepoint : stockage dans ridaNodes 
	Cette fonction est une fonction "classique" de sharepoint en cas de succès
	C'est la fonction qui récupère la liste sharepoint
***/


function onGetQuerySucceeded(sender, args) {
    var fields, l_ridaobj, listItemEnumerator, key;
    ridaNodes = [];
	
    try {
        console.log("Retrieve RIDA items");
        console.log(collListItem);

        listItemEnumerator = collListItem.getEnumerator();
	    while (listItemEnumerator.moveNext()) {
	        fields = listItemEnumerator.get_current().get_fieldValues();
	        l_ridaobj = new Object(); // TODO : faut-il utiliser la syntaxe {} au lieu de Object() ?
	        l_ridaobj.idRida = fields.ID;
	        for (key in SHAREPOINTLIST_MATCHINGNAME) { // SHAREPOINTLIST_MATCHINGNAME defined in interfaceConfig.js
				l_ridaobj[key] = formateFieldToExport(fields[SHAREPOINTLIST_MATCHINGNAME[key]]);
	        	}
			
			// si la donnée panneau est vide on force la valeur par défaut
			// et si le panneau précisé est en dehors des noms connu => valeur par défaut également

			var found = false;
			for (var i in BOARDSTOSYNC){
					if( l_ridaobj.hasOwnProperty("PanneauiObeya") )
						if(l_ridaobj.PanneauiObeya == BOARDSTOSYNC[i])
							found = true;
				}

			if(!found){
				l_ridaobj.PanneauiObeya=BOARDSTOSYNC[0];
				console.log( "Panneau mal configuré dans RIDA :" +l_ridaobj.subject
					+"*. Positionnement du panneau par défaut : " +BOARDSTOSYNC[0]  );
				}
			ridaNodes.push(l_ridaobj); // on ajoute l'entrée dans l'array
	    }

		
	    // Initialisation connexion
		if (g_syncList !== null) 
			if (g_syncList.length > 1) 
				throw new InterfaceException("Une autre instance est déjà en cours sur votre navigateur Exiting...\ nsyncList!=0 ");
            else checkIn(syncNotes); // Appel de la fonction principale de synchronisation ICI

	} catch (e) {
		displayException(
				new InterfaceException(
									"Une erreur est survenue à la lecture de la liste sharepoint : " + e.message
								  	+ "possiblement une des propriétés de la liste \"SHAREPOINTLIST_MATCHINGNAME\" n'a pas été trouvée parmi les colonnes de la table RIDA. vérifier à tout hasard le fichier de configuration \n "
								  )
				);
					enableButton();// Réactivation du bouton
        			lockSync=false;
					window.location.reload() ; // rafraichi la page après l'erreur
	}
}

