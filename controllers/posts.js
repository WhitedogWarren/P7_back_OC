const { Post, User, Comment } = require('../models');
const fs = require('fs');

const defaultInclude = [
    {
        model: User,
        attributes: ['id', 'firstname', 'lastname', 'avatarUrl', 'role']
    },
    {
        model: Comment,
        include: [
            {
                model: User,
                attributes: ['id', 'firstname', 'lastname', 'avatarUrl', 'role']
            }
        ]
    }
];

//////
// sends a shunk of 10 posts, starting from the newest before req.params.postId
//////
exports.getPostsShunk = (req, res) => {
    User.findOne({where: {id: req.auth.userId}}).then(user => {
        Post.findAll({
            offset: (req.params.postId -0),
            limit: 10,
            order: [['id', 'DESC']],
            include: [
                { 
                    model: User,
                    attributes: ['id', 'firstname', 'lastname', 'avatarUrl', 'role']
                },
                {
                    model: Comment,
                    include: [
                        {
                            model: User,
                            attributes: ['id', 'firstname', 'lastname', 'avatarUrl', 'role']
                        }
                    ]
                }
            ]
        })
        .then(data => {
            for(let post of data) {
                post.reported = JSON.parse(post.reported);
                post.Comments = post.Comments.reverse();
            }
            //////
            // filter moderated posts if requestor is not post author
            //////
            let filteredData = [];
            for(let post of data) {
                if(!(post.moderated && post.UserId !== req.auth.userId))
                    filteredData.push(post);
            }
            //send filtered data to simple user
            if(user.role == 'user') {
                res.status(200).json(filteredData);
            }
            else {
                res.status(200).json(data);
            }
        }).catch(error => {
            console.log('Erreur in postCtrl.getPostsShunk : ');
            console.log(error);
            res.status(500).json({ message : 'Une erreur est survenue, veuillez r??essayer'});
        }).catch(error => {
            console.log('Erreur dans postCtrl.getPostsShunk :\n' + error);
            res.status(500).json({ message : 'Une erreur est survenue, veuillez r??essayer' });
        })
    }).catch(error => {
        console.log('Erreur dans postCtrl.getPostsShunk :\n' + error);
        res.status(500).json({ message : 'Une erreur est survenue, veuillez r??essayer' });
    })
}

//sends all posts from the user whose id is req.params.id
exports.getPostsFromUser = (req, res, next) => {
    User.findOne({where: {id: req.auth.userId}}).then(user => {
        Post.findAll({
            where: {UserId: req.params.id},
            include: [
                {
                    model: User,
                    attributes: ['id', 'firstname', 'lastname', 'avatarUrl']
                },
                {
                    model: Comment,
                    include: [
                        {
                            model: User,
                            attributes: ['id', 'firstname', 'lastname', 'avatarUrl']
                        }
                    ]
                }
            ]
        })
        .then(data => {
            for(let post of data) {
                post.reported = JSON.parse(post.reported);
            }
            let filteredData = [];
            for(let post of data) {
                if(!(post.moderated && post.UserId !== req.auth.userId))
                    filteredData.push(post);
            }
            if(user.role == 'user') {
                res.status(200).json(filteredData);
            }
            else {
                res.status(200).json(data);
            }
        })
        .catch(error => {
            console.log(error);
        })
    })
}

exports.createPost = (req, res, next) => {
    if(!req.body.postedContent && !req.file) {
        return res.status(400).json({ message: 'Le contenu est vide!', newPost: null });
    }
    let postObject = {
        UserId: req.auth.userId,
        content: req.body.postedContent,
        imageUrl: null
    }
    if(req.file) {
        postObject.imageUrl = req.file.filename;
    }
    Post.create(postObject).then((newData) => {
        Post.findOne({
            where: {
                id: newData.dataValues.id},
                include: defaultInclude
        })
        .then(newPostData => {
            console.log(newPostData.dataValues);
            newPostData.reported = JSON.parse(newPostData.reported);
            res.status(200).json({message: 'cr??ation de post effectu??e', newPost: newPostData });
        })
    }).catch(error => {
        console.log('error in controller/posts.js : ' + error);
        res.status(500).json({ message: 'Le post n\'a pas pu ??tre cr????', newPost: postObject });
    })
}

exports.updatePost = (req, res, next) => {
    Post.findOne({ where: {id: req.body.postId}}).then(post => {
        if(!post) {
            res.status(404).json({ error: new Error('post non trouv??')});
        }
        if(post.UserId !== req.auth.userId) {
            return res.status(401).json({message: 'requ??te non autoris??e', newPost: null});
        }
        if((req.body.editedContent == '' || req.body.editedContent == undefined || req.body.editedContent == null) && (!req.file && !post.imageUrl))
            return res.status(400).json({message: 'Le contenu est vide!'});
        function updateProcess() {
            const postObject = req.file ?
            {
                content: req.body.editedContent,
                imageUrl: req.file.filename
            } :
            {
                content: req.body.editedContent
            }
            if(req.body.deleteImage)
                postObject.imageUrl = null;
            Post.update(postObject, { where: {id: req.body.postId}}).then(() => {
                console.log('post mis ?? jour');
                Post.findOne({
                    where: {id: req.body.postId},
                    include: defaultInclude
                })
                .then(post => {
                    post.reported = JSON.parse(post.reported);
                    res.status(200).json({ message: "post mis ?? jour", newPost: post });
                }).catch(error => {
                    console.log('Erreur dans postCtrl.updatePost :');
                    console.log(error);
                    res.status(500).json({ message: 'Une erreur est survenue, veuillez rafra??chir la page', newPost: null });
                })
            }).catch(err => {
                console.log('error in postCtrl.updatePost : ' + err);
                res.status(400).json({ message: 'Une erreur est survenue, veuillez r??essayer', newPost: null});
            });
        }
        if(req.file || req.body.deleteImage) {
            fs.unlink(`images/postImage/${post.imageUrl}`, () => {
                updateProcess();
            })
        }
        else
            updateProcess();
    }).catch(err => {
        console.log('error in postCtrl.updatePost : ' + err);
        res.status(400).json({ message: 'Une erreur est survenue, veuillez r??essayer', newPost: null});
    })
}

exports.deletePost = (req, res, next) => {
    Post.findOne({where: {id: req.params.id}}).then(post => {
        if(!post)
            return res.status(404).json({message: 'Post non trouv??.'});
        if( req.auth.userId !== post.UserId ) {
            return res.status(401).json({message: 'requ??te non autoris??e', newPost: null});
        }
        Post.destroy({where: {id: req.params.id}}).then(() => {
            if(post.imageUrl) {
                fs.unlink(`images/postImage/${post.imageUrl}`, () => {
                    console.log(`image ${post.imageUrl} supprim??e`)
                });
            }
            res.status(200).json({ message: 'suppression de post effectu??e', newPost: null});
        }).catch(error => {
            console.log('Error in controller/posts.js : ' + error);
            res.status(500).json({ message: 'Une erreur est survenue, veuillez r??essayer', newPost: null});
        })
    })
}

// sets the requestor in the list of those who have reported the given post ( req.body.postId )
exports.reportPost = (req, res) => {
    Post.findOne({where: { id: req.body.postId}}).then(post => {
        if(!post)
            return res.status(404).json({message: 'Post non trouv??.'});
        console.log('post.UserId : ' + post.UserId);
        console.log(`req.auth.userId : ${req.auth.userId}`);
        if( req.auth.userId == post.UserId ) {
            return res.status(401).json({message: 'requ??te non autoris??e', newPost: null});
        }
        let reportArray = JSON.parse(post.reported);
        if(reportArray.includes(req.auth.userId)) {
            return res.status(401).json({ message: 'Vous avez d??j?? signal?? ce post!'});
        }
        reportArray.push(req.body.userId);
        Post.update({reported: JSON.stringify(reportArray)}, { where: { id: req.body.postId}}).then(() => {
            Post.findOne({
                where: { id: req.body.postId},
                include: defaultInclude
            })
            .then(post => {
                delete post.User.dataValues.password;
                post.reported = JSON.parse(post.reported);
                res.status(201).json({ message: "Signalement enregistr??.", newPost: post});
            }).catch(error => {
                console.log('Erreur dans postCtrl.reportPost :');
                console.log(error);
                res.status(500).json({ message: 'Une erreur est survenue, veuiller rafra??chir la page.'});
            })
        }).catch(error => {
            console.log('Erreur dans postCtrl.reportPost : ' + error);
            res.status(500).json({ message: 'Une erreur est survenue, veuillez r??essayer'});
        });
    }).catch(error => {
        console.log('Erreur dans PostCtrl.reportPost : ' + error);
        res.status(500).json({message: 'Une erreur est survenue, veuillez r??essayer.'});
    });
}

//removes the requestor from the list of those whor have reported the given post ( req.body.postId )
exports.unreportPost = (req, res) => {
    Post.findOne({where: {id: req.body.postId}}).then(post => {
        if(!post)
            return res.status(404).json({message: 'Post non trouv??.'});
        let reportArray = JSON.parse(post.reported);
        if(!reportArray.includes(req.body.userId)) {
            return res.status(401).json({ message: 'Vous n\'avez pas signal?? ce post'});
        }
        reportArray.splice(reportArray.indexOf(req.body.userId), 1);
        Post.update({reported: JSON.stringify(reportArray)}, {where: { id: req.body.postId}}).then(() => {
            Post.findOne({
                where: { id: req.body.postId},
                include: defaultInclude
            })
            .then(post => {
                post.reported = JSON.parse(post.reported);
                res.status(201).json({ message: "Signalement annul??.", newPost: post});
            }).catch(error => {
                console.log('Erreur dans postCtrl.unreportPost :');
                console.log(error);
                res.status(500).json({ message: 'Une erreur est survenue, veuiller rafra??chir la page.'});
            })
        }).catch(error => {
            console.log('error in postCtrl.unreportPost : ' + error);
            res.status(500).json({ message: 'Une erreur est survenue, veuillez r??essayer.'});
        })
    }).catch(error => {
        console.log('Erreur in postCtrl.unreportPost : ' + error);
        res.status(500).json({ message: 'Une erreur est survenue, veuillez r??essayer'});
    })
}

//sets the given post ( req.body.postId ) as 'corrected' by its author
exports.notifyCorrection = async (req, res) => {
    const postToUpdate = await Post.findOne({where: {id: req.body.postId}}).catch(error => {
        console.log('Erreur in postCtrl.notifyCorrection : ' + error);
        res.status(500).json({ message: 'Une erreur est survenue, veuillez r??essayer', newPost: null});
    })
    if(!postToUpdate) {
        return res.status(404).json({ message: 'post non trouv??', newPost: null})
    }
    console.log(postToUpdate.dataValues);
    console.log(`req.auth.userId : ${typeof req.auth.userId}, ${req.auth.userId}`);
    console.log(`postToUpdate.userId : ${typeof postToUpdate.dataValues.UserId} ${postToUpdate.dataValues.UserId}`);
    if( req.auth.userId !== postToUpdate.dataValues.UserId ) {
        return res.status(401).json({message: 'requ??te non autoris??e', newPost: null});
    }
    await Post.update({corrected: true}, {where: {id: req.body.postId}}).catch(error => {
        console.log('Error in posts.js/notifyCorrection : ' + error);
        res.status(500).json({ message: 'Une erreur est survenue, veuillez r??essayer', newPost: null});
    })
    console.log('Post mis ?? jour');
    const post = await Post.findOne({
        where: { id: req.body.postId},
        include: defaultInclude
    }).catch(error => {
        console.log('Erreur dans postCtrl.notifyCorrection :');
        console.log(error);
        res.status(500).json({ message: 'Une erreur est survenue, veuiller rafra??chir la page., newPost: null'});
    })
    post.reported = JSON.parse(post.reported);
    res.status(201).json({ message: "Notification de correction re??ue.", newPost: post});
}

//unsets the given post ( req.body.postId ) as 'corrected' by the author
exports.avoidCorrection = (req, res) => {
    Post.findOne({where: {id: req.body.postId}}).then(post => {
        if(!post) {
            return res.status(404).json({ message: 'post non trouv??', newPost: null})
        }
        if( req.auth.userId !== post.UserId ) {
            return res.status(401).json({message: 'requ??te non autoris??e', newPost: null});
        }
        Post.update({corrected: false}, {where: {id: req.body.postId}}).then(() => {
            Post.findOne({
                where: { id: req.body.postId},
                include: defaultInclude
            })
            .then(post => {
                post.reported = JSON.parse(post.reported);
                res.status(201).json({ message: "demande d\'annulation de correction re??ue.", newPost: post});
            }).catch(error => {
                console.log('Erreur dans postCtrl.avoidCorrection :');
                console.log(error);
                res.status(500).json({ message: 'Une erreur est survenue, veuiller rafra??chir la page.'});
            })
        }).catch(error => {
            console.log('Error in posts.js/avoidCorrection : ' + error);
            res.status(500).json({ message: 'Une erreur est survenue, veuillez r??essayer', newPost: null});
        })
    }).catch(error => {
        console.log('Erreur in postCtrl.notifyCorrection : ' + error);
        res.status(500).json({ message: 'Une erreur est survenue, veuillez r??essayer', newPost: null});
    })
}

//////
// Reactions functions
/////

//Adds the requestor int the appropriate list of those who have emmited the given reaction
const setReaction = (req, res, reaction) => {
    Post.findOne({where: { id: req.body.postId}}).then( post => {
        if(!post) {
            console.log('Post non trouv??.');
            return res.status(404).json({ message: 'Post non trouv??.', newPost: null });
        }
        if(req.auth.userId == post.UserId) {
            return res.status(401).json({message: "vous ne pouvez pas r??agir ?? vos propres posts", newPost: null});
        }
        const reactionMap = new Map();
        reactionMap.set('like', {key: 'liked', value: JSON.parse(post.liked)});
        reactionMap.set('love', {key: 'loved', value: JSON.parse(post.loved)});
        reactionMap.set('laugh', {key: 'laughed', value: JSON.parse(post.laughed)});
        reactionMap.set('anger', {key: 'angered', value: JSON.parse(post.angered)});
        if(reactionMap.get('like').value.includes(req.auth.userId) || reactionMap.get('love').value.includes(req.auth.userId) || reactionMap.get('laugh').value.includes(req.auth.userId) || reactionMap.get('anger').value.includes(req.auth.userId)) {
            return res.status(401).json({ message: 'Vous ne pouvez emettre qu\'une seule r??action', newPost: null });
        }
        reactionMap.get(reaction).value.push(req.auth.userId);
        const updateObject = {};
        updateObject[reactionMap.get(reaction).key] = JSON.stringify(reactionMap.get(reaction).value);
        Post.update(updateObject, {where: {id: req.body.postId}}).then(() => {
            Post.findOne({
                where: { id: req.body.postId},
                include: defaultInclude
            })
            .then(post => {
                post.reported = JSON.parse(post.reported);
                res.status(201).json({ message: "Post mis ?? jour", newPost: post});
            }).catch(error => {
                console.log('Erreur dans postCtrl.setReaction :');
                console.log(error);
                res.status(500).json({ message: 'Une erreur est survenue, veuiller rafra??chir la page.', newPost: null});
            })
        })
    }).catch(error => {
        console.log('Erreur dans postCtrl.setReaction : ' + error);
        res.status(500).json({ message: 'Une erreur est survenue, veuillez r??essayer', newPost: null});
    })
}
//removes the requestor int the appropriate list of those who have emmited the given reaction
const unsetReaction = (req, res, reaction) => {
    Post.findOne({where: { id: req.body.postId}}).then(post => {
        if(!post) {
            console.log('Post non trouv??.');
            return res.status(404).json({ message: 'Post non trouv??.', newPost: null });
        }
        let reactionMap = new Map();
        reactionMap.set('like', {key: 'liked', value: JSON.parse(post.liked)});
        reactionMap.set('love', {key: 'loved', value: JSON.parse(post.loved)});
        reactionMap.set('laugh', {key: 'laughed', value: JSON.parse(post.laughed)});
        reactionMap.set('anger', {key: 'angered', value: JSON.parse(post.angered)});
        if(!reactionMap.get(reaction).value.includes(req.auth.userId)) {
            return res.status(400).json({ message: `Vous n'avez pas enregistr?? la r??action ${reaction} ?? ce post.`, newPost: null});
        }
        reactionMap.get(reaction).value.splice(reactionMap.get(reaction).value.indexOf(req.auth.userId), 1);
        let updateObject = {};
        updateObject[reactionMap.get(reaction).key] = JSON.stringify(reactionMap.get(reaction).value);
        Post.update(updateObject, {where: { id: req.body.postId}}).then(() => {
            Post.findOne({
                where: { id: req.body.postId},
                include: defaultInclude
            })
            .then(post => {
                post.reported = JSON.parse(post.reported);
                res.status(201).json({ message: "Post mis ?? jour", newPost: post});
            }).catch(error => {
                console.log('Erreur dans postCtrl.unlikePost :');
                console.log(error);
                res.status(500).json({ message: 'Une erreur est survenue, veuiller rafra??chir la page.'});
            })
        }).catch(error => {
            console.log('Erreur dans postCtrl.unlikePost : ' + error);
            res.status(500).json({ message: 'Une erreur est survenue, veuillez r??essayer'});
        })
    }).catch(error => {
        console.log('Erreur dans postCtrl.unsetReaction : ' + error);
        res.status(500).json({ message: 'Une erreur est survenue, veuillez r??essayer', newPost: null});
    })
}

exports.likePost = (req, res) => {
    setReaction(req, res, 'like');
}
exports.unlikePost = (req, res) => {
    unsetReaction(req, res, 'like');
}

exports.lovePost = (req, res) => {
    setReaction(req, res, 'love');
}
exports.unlovePost = (req, res) => {
    unsetReaction(req, res, 'love');
}

exports.laughPost = (req, res) => {
    setReaction(req, res, 'laugh');
}
exports.unlaughPost = (req, res) => {
    unsetReaction(req, res, 'laugh');
}

exports.angerPost = (req, res) => {
    setReaction(req, res, 'anger');
}
exports.unangerPost = (req, res) => {
    unsetReaction(req, res, 'anger');
}