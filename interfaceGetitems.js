/*** Récupère les données Sharepoint ***/

function retrieveListItems() {
    var /*clientContext,*/ ridaNodes = [], oList, camlQuery;    
	try {
        //clientContext = new SP.ClientContext(siteUrl); // note : siteUrl define in interface config / SP define in sharepoint included JS
	    oList = clientContext.get_web().get_lists().getByTitle(listTitle); // note : listTitle define in interface config
	    camlQuery = new SP.CamlQuery();
	    camlQuery.set_viewXml("<View />");
	    this.collListItem = oList.getItems(camlQuery);
	    clientContext.load(collListItem);
	    clientContext.executeQueryAsync(Function.createDelegate(this, this.onGetQuerySucceeded), Function.createDelegate(this, this.onQueryFailed));
	    return ridaNodes;
	} catch (e) {
		throw new InterfaceException("Les données \"" + listTitle + "\" n'ont pas pu être trouvées dans Sharepoint");
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

/*** Succès de la récupération des données Sharepoint : stockage dans ridaNodes ***/
function onGetQuerySucceeded(sender, args) {
    var fields, ticket, listItemEnumerator, key;
    ridaNodes = [];
	
    try {
        console.log("Retrieve RIDA items");
        console.log(collListItem);

        listItemEnumerator = collListItem.getEnumerator();
	    while (listItemEnumerator.moveNext()) {
	        fields = listItemEnumerator.get_current().get_fieldValues();
	        ticket = new Object(); // TODO : faut-il utiliser la syntaxe {} au lieu de Object() ?
	        ticket.idRida = fields.ID;
	        for (key in dataToSynchronize) { // dataToSynchronize defined in interfaceConfig.js
				ticket[key] = formateFieldToExport(fields[dataToSynchronize[key]]);
	        }
			ridaNodes.push(ticket);
	    }
	    
	    // Initialisation connexion
		if (syncList !== null) if (syncList.length > 1) throw new InterfaceException("Une autre instance est déjà en cours, veuillez patienter.\nsyncList!=0");
            else checkIn(syncNotes);

	} catch (e) {
		displayException(new InterfaceException("L'une des propriétés de la liste \"dataToSynchronize\" n'a pas été trouvée parmi les colonnes de la table RIDA."));
	}
}

