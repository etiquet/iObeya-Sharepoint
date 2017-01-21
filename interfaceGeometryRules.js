/*** Vérifie si un point appartient ou non à un rectangle ***/
function isPointInRectangle(x, y, left, top, right, bottom) {
var result = false;
	if (between(left, x, right) && between(top, y, bottom)) {
		result = true;
	}
	return result;
}

/*** Vérifie si un nombre appartient à un intervalle donné (bornes incluses) ***/
function between(min, p, max) {
var result = false;
	
	if (min < max) {
		if (p > min && p < max) {
			result = true ;
		}
	}
	
	if (min > max) {
		if (p > max && p < min) {
			result = true;
		}
	}
    
	// TODO relecteur : confirmer si === ou == 
	if (p === min || p === max) {
		result = true;
	}
	
	return result;
}

/*** Vérifie si des noeuds vérifiant la condition donnée chevauche le rectangle (x1, y1, x2, y2) ***/
function findNodesInRectangle(x1, y1, x2, y2, nodesiObeya, conditionMethod) {
var result = Array();
	
	for (var id in nodesiObeya){
		var iObeyaObject = nodesiObeya[id];
		if (conditionMethod(iObeyaObject)) {
			var chk = isRectanglesIntersectionNotNull(x1, y1, x2, y2, iObeyaObject.x, iObeyaObject.y, iObeyaObject.x+iObeyaObject.width, iObeyaObject.y+iObeyaObject.height);
			if (chk) {
				result.push(iObeyaObject);
			}
		}
	}
	
	return result;
}

/*** Vérifie si des éléments (tous sauf rouleaux) chevauchent le rectangle (x1, y1, x2, y2) ***/
function findElementsInRectangle(x1, y1, x2, y2, nodesiObeya) {
	return findNodesInRectangle(x1, y1, x2, y2, nodesiObeya, isNotRoll);
}

/*** Vérifie si des étiquettes "Ressource" chevauchent le rectangle (x1, y1, x2, y2) ***/
function findActorsInRectangle(x1, y1, x2, y2, nodesiObeya){
	return findNodesInRectangle(x1, y1, x2, y2, nodesiObeya, isActorLabel);
}

/*** Retourne tous les éléments qui sont au dessous du post-it ***/
function findOverlappingElements(note, nodesiObeya){
	var foundElements = findNodesInRectangle(note.x, note.y, note.x + note.width, note.y + note.height, nodesiObeya, isNotNote);
	var overLappingElements = Array();
	
	// Ne conserver que les éléments situés "au-dessus" du post-it
    // Vérifier sur les post-it sont bien dans le même tableau
	for (i in foundElements) {
		if (foundElements[i].zOrder > note.zOrder && foundElements[i].boardid == note.boardid) {
            console.log("note dans: " + note.boardname);
			overLappingElements.push(foundElements[i]);
		}
        //console.log("Note n'est pas au-dessus!");
	}
	
	return overLappingElements;
}


/*** Vérifie si l'intersection entre deux rectangles est vide ou non ***/
function isRectanglesIntersectionNotNull(x1_1, y1_1, x2_1, y2_1, x1_2, y1_2, x2_2, y2_2) {

	// Sommets du rectangle dans l'étiquette
	var chk1 = isPointInRectangle(x1_1, y1_1, x1_2, y1_2, x2_2, y2_2);
	var chk2 = isPointInRectangle(x1_1, y2_1, x1_2, y1_2, x2_2, y2_2);
	var chk3 = isPointInRectangle(x2_1, y2_1, x1_2, y1_2, x2_2, y2_2);
	var chk4 = isPointInRectangle(x2_1, y1_1, x1_2, y1_2, x2_2, y2_2);
	
	// Etiquette dans les sommets du rectangle
	var chk5 = isPointInRectangle(x1_2, y1_2, x1_1, y1_1, x2_1, y2_1);
	var chk6 = isPointInRectangle(x1_2, y2_2, x1_1, y1_1, x2_1, y2_1);
	var chk7 = isPointInRectangle(x2_2, y2_2, x1_1, y1_1, x2_1, y2_1);
	var chk8 = isPointInRectangle(x2_2, y1_2, x1_1, y1_1, x2_1, y2_1);

	return (chk1 || chk2 || chk3 || chk4 || chk5 || chk6 || chk7 || chk8);
}


/*** Vérifie si l'origine d'un post-it est présente à la position (x,y) ***/
function findNoteAtPosition(x, y, nodesiObeya){
	for (var id in nodesiObeya){
		var iObeyaObject = nodesiObeya[id];
		if (iObeyaObject['@class'] ==="com.iobeya.dto.BoardNoteDTO") {
			var chk1 = (x == iObeyaObject.x && y == iObeyaObject.y);
			if (chk1) {
				return iObeyaObject.id;
			}
		}
	}
	return -1;
}

/*** Retourne vrai si l'élément passé en paramètre est une étiquette de "Reponsable" ***/
function isActorLabel(iObeyaObject) {
	return iObeyaObject['@class'] === "com.iobeya.dto.BoardLabelDTO" && iObeyaObject.backgroundColor == LABEL_DEFAULT_COLOR;
}

/*** Retourne vrai si l'élément passé en paramètre est un sticker "% achevé" ***/
function isPercentCompleteSticker(iObeyaObject) {
	return iObeyaObject['@class'] === "com.iobeya.dto.BoardStickerDTO" && iObeyaObject.setName.startsWith(percentageStickerMapping.setName);
}

/*** Retourne vrai si l'élément passé en paramètre est un sticker "Priorité" ***/
function isPrioritySticker(iObeyaObject) {
	return iObeyaObject['@class'] === "com.iobeya.dto.BoardStickerDTO" && iObeyaObject.setName.startsWith(priorityStickerMapping.setName);
}

/*** Retourne vrai si l'élément passé en paramètre est une étiquette de "Statut" ***/
function isStatusLabel(iObeyaObject) {
	return iObeyaObject['@class'] === "com.iobeya.dto.BoardLabelDTO" && iObeyaObject.backgroundColor != LABEL_DEFAULT_COLOR;
}

/*** Retourne vrai si l'élément passé en paramètre n'est pas un post-it ***/
function isNotNote(iObeyaObject) {
	return iObeyaObject['@class'] !== "com.iobeya.dto.BoardNoteDTO";
}

/*** Retourne vrai si l'élément passé en paramètre n'est pas un rouleau ***/
function isNotRoll(iObeyaObject) {
	return iObeyaObject['@class'] !== "com.iobeya.dto.BoardRollDTO";
}

/*** Retourne le zOrder maximum d'une liste de noeuds ***/
function maxZOrder(nodesiObeya) {
	var lastZOrder = 0;
	for (var i=0; i<nodesiObeya.length; i++) {
		if (!isNaN(nodesiObeya[i].zOrder)) {
			// Calcul du zOrder à affecter
			lastZOrder = Math.max(lastZOrder, nodesiObeya[i].zOrder+1);
		}
	}
	return lastZOrder;
}

/*** Trie le tableau d'éléments iObeya par zOrder, puis leur réassigne de nouveaux zOrders ***/
function refreshZOrders(nodesiObeya) {
	// Tri
	nodesiObeya.sort(compareZOrders);
	
	// Nouveaux zOrders
	for (i=0; i<nodesiObeya.length; i++) {
		nodesiObeya[i].zOrder = i+1;
	}
	
	return nodesiObeya;
}

/*** Compare les zOrders de deux éléments iObeya ***/
function compareZOrders(x, y) {
    return y.zOrder - x.zOrder;
}