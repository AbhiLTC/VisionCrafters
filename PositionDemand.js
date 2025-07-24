if (typeof (husky) === "undefined") {
    husky = {};
}
if (typeof (husky.PositionDemand) === "undefined") {
    husky.PositionDemand = {};
}

husky.PositionDemand.onChangeSkills = function (executionContext) {
    var formContext = executionContext.getFormContext();
    
    var lookupOptions = {
        defaultEntityType: "ltc_skill",
        entityTypes: ["ltc_skill"],
        allowMultiSelect: true,
        filters: [
            {
                filterXml: `<filter type="and">
                                <condition attribute="statecode" operator="eq" value="0" />
                            </filter>`,
                entityLogicalName: "ltc_skill"
            }
        ]
    };

    Xrm.Utility.lookupObjects(lookupOptions).then(
        function (selectedRecords) {
            console.log(selectedRecords);
            if (selectedRecords && selectedRecords.length > 0) {
        var names = selectedRecords.map(function (record) {
                    return record.name;
                }).join(", ");

            console.log("Setting skills field with values:", names);

            var fieldAttr = formContext.getAttribute("ltc_skills");
            if (fieldAttr) {
                fieldAttr.setValue(names);
            } else {
                console.error("Field 'ltc_skillsrequired' not found on form.");
            }
        } else {
            console.log("No records selected.");
        }

        },
        function (error) {
            console.error(error);
        }
    );
}

husky.PositionDemand.onSave=function (executionContext) {
    
 var formContext = executionContext.getFormContext();

    // 1 = Create, 2 = Update, 3 = Read-Only, etc.
    if (formContext.ui.getFormType() !== 1) {
        return;    // skip for anything but a new record
    } // added now

    if (sessionStorage.getItem("saveTriggered")==="true"){
        sessionStorage.removeItem("saveTriggered");
        return;
    }
    husky.PositionDemand.RestrictSave(executionContext);
}
husky.PositionDemand.RestrictSave=function(executionContext){

//const formContext = executionContext.getFormContext();

    const eventArgs = executionContext.getEventArgs();
debugger;
    eventArgs.preventDefault();
    /*if(sessionStorage.getItem("saveTriggered"))
    {eventArgs.preventDefault();} // prevent save for now
    else{
        sessionStorage.clear();
        return;
    }
    sessionStorage.setItem("saveTriggered","Yes");*/

    const formContext = executionContext.getFormContext();


    const businessUnit = formContext.getAttribute("ltc_businessunit")?.getValue()?.[0]?.id;
    const platform = formContext.getAttribute("ltc_platform")?.getValue()?.[0]?.id;
    const jobCategory = formContext.getAttribute("ltc_jobcategory")?.getValue();
    const positionSkills = formContext.getAttribute("ltc_skill")?.getValue(); // array of values

    if (!businessUnit || !platform || jobCategory === null || !positionSkills?.length) {
        Xrm.Navigation.openAlertDialog({ text: "Please fill Business Unit, Platform, Job Category, and Skills before saving." });
        return;
    }

    // Fetch ltc_husky records where BU, Platform, JobCategory match
    const fetchXml = `
        <fetch>
          <entity name="ltc_positiondemand">
            <attribute name="ltc_positiondemandid"/>
            <attribute name="ltc_name"/>
            <attribute name="ltc_skill"/>
            <filter>
              <condition attribute="ltc_businessunit" operator="eq" value="${businessUnit.replace(/[{}]/g, "")}"/>
              <condition attribute="ltc_platform" operator="eq" value="${platform.replace(/[{}]/g, "")}"/>
              <condition attribute="ltc_jobcategory" operator="eq" value="${jobCategory}"/>
              <condition attribute="statecode" operator="eq" value="0" />
            </filter>
          </entity>
        </fetch>`;

    Xrm.WebApi.retrieveMultipleRecords("ltc_positiondemand", "?fetchXml=" + encodeURIComponent(fetchXml))
        .then(result => {
            if (!result.entities.length) {                 	
                sessionStorage.setItem("saveTriggered","true");
                formContext.data.save();
                return;
            }

            let bestMatch = null;
            let bestPercentage = 0;
            const matches = [];

            result.entities.forEach(husky => {
                const huskySkills = husky.ltc_skill?.split(",").map(s => parseInt(s));
                if (!huskySkills?.length) return;

                const commonSkills = huskySkills.filter(s => positionSkills.includes(s));
                const percentMatch = Math.round((commonSkills.length / positionSkills.length) * 100);

                if (percentMatch > bestPercentage) {
                    bestPercentage = percentMatch;
                    bestMatch = husky;
                }

                matches.push({
                    husky,
                    percentMatch
                });
            });

            if (!matches.length) {  
              sessionStorage.setItem("saveTriggered","true");
                formContext.data.save();
                return;
            }

            // Sort by % match desc
            matches.sort((a, b) => b.percentMatch - a.percentMatch);
            var bestMatchHuskyName=matches[0].husky.ltc_name;
            var clientUrl=Xrm.Utility.getGlobalContext().getClientUrl();
            var bestMatchHuskyId=matches[0].husky.ltc_positiondemandid;
            var link=clientUrl+"/main.aspx?appid=f9a81641-065f-f011-bec1-000d3af2c088&pagetype=entityrecord&etn=ltc_positiondemand&id="+bestMatchHuskyId;

            let html = `<div><h3>Matching Husky Record Found</h3>`;
            matches.forEach(m => {
                const url = `${Xrm.Utility.getGlobalContext().getClientUrl()}/main.aspx?appid=f9a81641-065f-f011-bec1-000d3af2c088&pagetype=entityrecord&etn=ltc_positiondemand&id=${m.husky.ltc_positiondemandid}`;
                html += `<p><a href="${url}" target="_blank">${m.husky.ltc_name}</a> - ${m.percentMatch}% skills matched</p>`;
            });
            html += `</div>`;

            // Show dialog
            Xrm.Navigation.openConfirmDialog({
                title: `Existing Position Demand Match: ${bestPercentage}%`,
                text: `The best matching Position Demand record is with Name ${bestMatchHuskyName}.\n\n Click "OK" to open the matched Position Demand.\n\nOr "Cancel" to ignore and proceed with saving. `
            }).then(response => {
                if (response.confirmed) {
                    window.open(link);
                    // Stay on form, no save
                }
else if (response.confirmed === false) {
                    // User wants to save anyway
                    sessionStorage.setItem("saveTriggered","true");
                    formContext.data.save();
                    return;
                }
else{
// This is added to prevent saving when closing the dialogue box.
}
            });
        })
        .catch(err => {
            console.error(err);
            Xrm.Navigation.openAlertDialog({ text: "Error fetching husky records: " + err.message });
        });

}

