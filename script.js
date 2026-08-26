/* =========================================================
   FAQ
   ========================================================= */

const faqItems =
    document.querySelectorAll(".faq-item");


faqItems.forEach((item) => {

    const question =
        item.querySelector(".faq-question");

    const answer =
        item.querySelector(".faq-answer");


    question.addEventListener("click", () => {

        const isOpen =
            item.classList.contains("active");


        /* Κλείνει όλα */

        faqItems.forEach((otherItem) => {

            const otherQuestion =
                otherItem.querySelector(".faq-question");

            const otherAnswer =
                otherItem.querySelector(".faq-answer");


            otherItem.classList.remove("active");

            otherQuestion.setAttribute(
                "aria-expanded",
                "false"
            );

            otherAnswer.style.maxHeight = null;

        });


        /* Ανοίγει το επιλεγμένο */

        if (!isOpen) {

            item.classList.add("active");

            question.setAttribute(
                "aria-expanded",
                "true"
            );

            answer.style.maxHeight =
                answer.scrollHeight + "px";

        }

    });

});



/* =========================================================
   MOBILE NAVIGATION
   ========================================================= */

const mobileMenuButton =
    document.getElementById("mobileMenuButton");

const mobileMenu =
    document.getElementById("mobileMenu");

const mobileMenuLinks =
    document.querySelectorAll(
        ".mobile-menu-links a"
    );


/* OPEN / CLOSE */

mobileMenuButton.addEventListener(
    "click",
    () => {

        const isOpen =
            mobileMenu.classList.contains(
                "active"
            );


        mobileMenu.classList.toggle(
            "active"
        );

        mobileMenuButton.classList.toggle(
            "active"
        );


        mobileMenuButton.setAttribute(
            "aria-expanded",
            String(!isOpen)
        );

    }
);



/* CLOSE AFTER CLICKING LINK */

mobileMenuLinks.forEach((link) => {

    link.addEventListener(
        "click",
        () => {

            mobileMenu.classList.remove(
                "active"
            );

            mobileMenuButton.classList.remove(
                "active"
            );

            mobileMenuButton.setAttribute(
                "aria-expanded",
                "false"
            );

        }
    );

});


